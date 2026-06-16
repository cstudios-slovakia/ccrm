# Durian 1.3.x "Durian" Release Update Log

This document outlines the design and implementation details for upgrading the CRM system to 1.3.x, code-named **Durian**. 

## 1. Goal & Features
The core theme of the Durian release is **AI Integration**. The foundation involves introducing global OpenAI API credentials into the system settings, Gating it with a dedicated RBAC permission node (`ai_config`), and preparing the backend & database to persist these settings.

---

## 2. Proposed & Completed Changes

### A. OpenAI Key Storage
- **Settings Tab**: Added a new settings section under the sub-tab **"AI Integrations"** (`src/components/SettingsView.tsx`).
- **OpenAI API Key Field**: 
  - Password-masked input field with visibility toggle.
  - Interactive validation badge reflecting connection state (e.g. green "AI Connection Ready" if key starts with `sk-`, orange "API Key Missing" otherwise).
- **Save Flow**: Pushes the OpenAI API key to the synchronized database settings payload (`integrationsConfig.openAiKey`).

### B. RBAC & Security Permissions
- **New Permission Slug**: Added `ai_config` ("AI & OpenAI Integrations") control.
- **RBAC Matrix Grid**: Added a dedicated row under the **Global System Configurations** category inside the role management panel (`src/components/SettingsView.tsx`).
  - Gated to allow full **Edit**, read-only **View**, or **None** permissions.
- **Access Gating**: Settings sub-tab is only visible and interactable if the active user's role has `ai_config !== "nothing"`. Added `ai_config` checks to settings page access router (`src/App.tsx`).

### C. Backend & Seeding Updates
- **Fallbacks & Setup**: Added `ai_config => edit` for Admin and `ai_config => nothing` for Project Manager roles within:
  - Database provision scripts: `public/api/setup.php` (seeds permission slug).
  - Sync handlers: `public/sync.php` (processes default roles configuration).

### D. RAG System Architectural Plan
- **File**: Updated [docs/RAG_SYSTEM_PLAN.md](file:///Users/erik/Documents/vibe%20coding/crm/docs/RAG_SYSTEM_PLAN.md) detailing:
  - Input parsing strategies for Word documents, PowerPoint presentations, image scans (OCR), email logs (synchronized from SQL database tables), and chat logs.
  - Text chunking (500–1000 characters) and embedding models comparison (OpenAI vs. locally hosted `SentenceTransformers` API).
  - Three strictly supported vector storage backends: **Qdrant (Sidecar Container)**, **MariaDB 11.8+ (native vector datatype with conditional environment-gated selection)**, and **Pinecone Cloud (external managed database service)**. Removed Postgres and MySQL JSON emulation due to performance and maintenance bottlenecks.
  - **Security & Architectural Hardening**: Added strict RBAC Tenant Filtering specifications (`client_id` metadata requirements) to Vector DB queries to prevent cross-tenant data leaks. Enforced Asynchronous OCR execution (`rag_tasks` queue) to prevent Apache thread DoS. Fixed "Lossy RAG" by mandating raw text chunking instead of pre-summarization.
  - **RAG Status & Environment Diagnostics Panel**: Added details for a self-diagnosing control panel that checks system capabilities (PHP memory, zip/xml extensions, Tesseract binary, IMAP configuration, and Pinecone credentials status) to dynamically toggle ingestion features and show status with glowing green/red badges in the UI.

---

## 3. Verification Plan
1. **Compilation**: Run `npm run build` to verify clean production bundles.
2. **Access Control (RBAC)**:
   - Log in as `Admin` and verify **AI Integrations** tab is fully visible and editable.
   - Log in as a `Project Manager` and check that the AI tab is hidden and inaccessible.
3. **Persist Test**: Save an OpenAI API key (e.g. `sk-proj-testkey`), reload, and verify it persists and propagates correctly.
4. **Architectural Review**: Confirm [docs/RAG_SYSTEM_PLAN.md](file:///Users/erik/Documents/vibe%20coding/crm/docs/RAG_SYSTEM_PLAN.md) matches formatting requirements and details all required components.
