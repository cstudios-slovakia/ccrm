# Clementine 1.2.x "Clementine" Release Plan

This document outlines the design and implementation details for upgrading the CRM system to 1.2.x, code-named **Clementine**. 

## 1. Goal & Features
The goal is to implement user-specific personal settings, an email server configuration tool (supporting IMAP/SMTP and MS Exchange), and a fully featured 3-column email system emulated from `AuroraMail`. Incoming/outgoing emails from clients will also be integrated directly into their CRM Lead timelines and Client profiles.

---

## 2. Proposed Changes

### A. Personal Settings Screen
- **Entry Point**: Add a **"Personal Settings"** button inside the user avatar slideout drawer (`src/components/Header.tsx`).
- **Navigation**: Clicking it sets `activeTab` to `"personal-settings"`.
- **Layout**: Emulate the system configuration UI (`src/components/SettingsView.tsx`), using a left sidebar for sub-tabs and a right pane for form details.
- **Sub-Tabs**:
  1. **Basic Settings**: 
     - Form to edit basic user parameters: Name, Email, Password, and language selection.
  2. **Email Server Settings**:
     - Form to configure incoming (IMAP) and outgoing (SMTP) details:
       - **Incoming (IMAP)**: Host, Port, Secure (SSL/TLS), Username, Password.
       - **Outgoing (SMTP)**: Host, Port, Secure (SSL/TLS), Username, Password.
     - **Microsoft Exchange Server Options**:
       - Setup credentials/domain/URL.
       - Include instructions on how to enable IMAP/SMTP in Office 365, configure app passwords, or register a tenant client app for OAuth.
     - **Validation**: A "Test Connection" button that fires a backend ping to ensure the server details are functional.

### B. Navigation & Sidebar Icon
- **State Integration**: Save the user's validated email settings in the database (synced via `sync.php` inside the user's `metadata_json` column).
- **Sidebar Envelope Icon**:
  - In `src/components/Sidebar.tsx`, dynamically render a **pink envelope icon** on the left side menu if the active user's mail server settings are configured and validated.
  - Clicking this icon switches `activeTab` to `"email"`.

### C. Unified Email System (AuroraMail emulation)
- **Component**: Create `src/components/EmailView.tsx` structured as a 3-column layout:
  - **Column 1 (Folders List)**: Render Inbox, Sent, Trash, etc., loaded from the active mail server.
  - **Column 2 (Email Thread List)**: Paginated thread summary headers displaying Subject, Sender (with geometric colored avatar), Date/Time, and attachment indicators. Includes scroll-to-load pagination and unread search filters.
  - **Column 3 (Email Detail Pane)**:
    - Renders the full parsed HTML body within a sandboxed `iframe` to prevent styling bleed.
    - Group conversation emails into collapsible cards chronologically.
    - Compose drawer/modal to write new outgoing emails, complete with CC/BCC fields and rich text body.

### D. PHP Backend API Integration
- **New API File**: `public/api/mail_broker.php` (included in package composer updates).
- **Endpoints**:
  - `POST ?action=test_credentials`: Connects and tests IMAP/SMTP endpoints.
  - `GET ?action=get_folders`: Lists folder mailboxes.
  - `GET ?action=get_emails`: Fetches paginated headers/metadata.
  - `GET ?action=get_email_detail&uid=X`: Fetches parsed HTML body and details.
  - `GET ?action=get_attachment&uid=X&att_id=Y`: Serves attachments.
  - `POST ?action=send_email`: Sends outgoing email via SMTP.
  - `POST ?action=toggle_seen`: Marks email as read/unread.
  - `DELETE ?action=delete_email`: Moves email to trash or deletes permanently.
- **PHP Libraries**: Use standard PHP `imap_*` functions and a lightweight SMTP mailer/sockets transport.

### E. CRM Lead & Client Integration
- **Sync Event Handler**:
  - When loading a lead's detail drawer or a client's profile page:
    - Match leads/clients by their `email` address.
    - Retrieve matching email correspondences from the backend mail server.
    - Display these emails in the **Lead Timeline** and **Client Profile Timeline** alongside normal CRM notes and activities.

---

## 3. Verification Plan
1. **Linting**: Ensure all new files build correctly with Vite/TypeScript compiler.
2. **Setup Testing**: Configure a test account (e.g. `erik@cstudios.sk`) in Personal Settings and verify successful validation.
3. **Mail client validation**: Verify folders list, pagination, and detail viewing load properly.
4. **CRM Association validation**: Send a test email from/to an email address of an active lead, and verify it pops up in the Lead's timeline view.
