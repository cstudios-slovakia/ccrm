# Update 1.7 (Codename: Huckleberry)

This document tracks all new features, architectural changes, and bug fixes introduced in the 1.7 Huckleberry update.

## Features & Improvements
* **Workflow Automation Engine** (Completed)
  * Event manager for creating automated workflows, inspired by tools like n8n / Make.com.
  * **Database Infrastructure**: Created `workflows`, `workflow_queue`, and `workflow_logs` tables for storing workflow graphs, queuing execution events, and recording execution traces.
  * **Backend Automation Engine**: Developed a robust executor in `api/workflows_engine.php` that routes nodes/edges, resolves dynamic variable tags (e.g. `{{$trigger.name}}`), and runs conditions using simplified JS syntax.
  * **API & Cron Infrastructure**: Built CRUD endpoints in `api/workflows.php` and a secure cron endpoint in `api/cron.php` to process queued tasks and evaluate timer schedules.
  * **Sync Hooks**: Integrated trigger hooks into `sync.php` to automatically detect and queue actions on Lead creation, status updates, client creation, new task creation, task state changes, and new timeline entries.
  * **Visual Node Editor UI**: Created a React-based visual builder (`AutomationView.tsx`) with a deep purple theme, offering step addition, condition editor, variable mapping picker, and duplication/cloning.
  * **Visual Debugger**: Added an execution history trace explorer allowing operators to inspect the raw JSON inputs and outputs of each node for any historical execution to simplify debugging.
  * **Automation Settings**: Added central API Key storage for OpenAI, Anthropic, and Gemini, alongside cron URL configuration.
  * **Toolbox Quick-Actions**: Added a top-bar dropdown containing configured manual trigger buttons, supporting custom colors, icons, and button styling (full, skeleton, icon-only).
  * **Visual Small Icons**: Added contextual small icons inside node configuration cards, inputs, and selector dropdown rows to visually represent the selected entity types (e.g., Lead, Client, Task, Timer, Code Expression, AI Provider), greatly improving configuration readability and comprehension.
  * **Grouped Custom Dropdowns**: Grouped the Trigger Event selector and Action selector lists by their system modules (Leads, Clients, Tasks, System/Email) using their respective module color schemes (Blue, Green, Orange, Pink) and icons, replacing browser-default native selects with a high-fidelity React popover UI.
  * **Horizontal Visual Flow & Marked Handles**: Moved connection handles to the left (Input) and right (Output) sides of nodes for a horizontal workflow layout. Added clear, styled labels ("IN", "OUT", "TRUE", "FALSE") inside the handles, and updated connection bezier curves to bend horizontally.
  * **Comprehensive Client Fields & Variable Tag Picker**: Expanded the 'Create Client' action node configuration UI and PHP engine handler to support all CCRM client parameters (Client Name, Client Type, Email, Phone, Street, City, Postal Code, Country, IČO/Company ID, DIČ/Tax ID, IČ DPH/VAT ID, Contact Person, Website). Built a reusable `<VariableInputField>` component that opens a dynamic tag suggestion popover on focus or button click to insert variables (e.g., `{{$trigger.name}}`, `{{$trigger.email}}`) while supporting free-form fixed text.





* **Collapsable Workflow Blocks**: Added expand/collapse chevron toggles on node cards in `AutomationView.tsx` to hide configuration forms while keeping input and output connection handles vertically centered and active.
* **Movable / Pannable Canvas**: Implemented interactive background canvas panning (`panOffset`) allowing users to drag the canvas to move around large workflows, complete with dynamic grid tracking and a `Reset View` button.
* **Social Media (Zernio) Settings Integration**: Added a dedicated Social Media configuration section in system settings (`SettingsView.tsx`), supporting Zernio API key connection, 1-Click Device Authorization, real-time connection verification, and connected social accounts status.
* **Zernio Social Media Settings UI Refinement**: Streamlined the Zernio settings section when connected (`isEditingZernio` toggle). Automatically hides device authorization and setup cards once a valid connection is established, presenting a clean connected status card with connected social accounts overview and an "Edit Connection" option.
* **Zernio API Reference Documentation**: Added full Zernio API & Agent specification ([docs/zernio-llms-full.txt](file:///Users/erik/Documents/vibe%20coding/crm/docs/zernio-llms-full.txt)) to the project documentation directory for LLM reference and integration.
* **Social Media Multi-Platform Navigation & View**: Added dedicated **Social Media** tab (`SocialMediaView.tsx`) to main navigation menu with left-sidebar source filtering (All platforms, Twitter/X, Instagram, TikTok, LinkedIn, YouTube, Facebook, Threads, Bluesky, and Status filters).
* **3-View Switcher & Grouping**:
  - **List View (Default)**: Grouped chronologically by date with same-day posts rendered side-by-side in responsive cards, showing full Zernio base stats (Likes, Comments, Shares, Impressions, Clicks, Engagement Rate).
  - **Calendar View**: Interactive monthly grid displaying posts by date with platform badges & inspection modals.
* **Zernio Social Analytics & Platform Normalization (1.7.61)**:
  * **Full CCRM Analytics Dashboard**: Rebuilt the Analytics view (`SocialMediaView.tsx`) to match Zernio analytics metrics in CCRM's signature glassmorphic design system. Features Posting Analytics & Inbox Analytics sub-tabs, Platform/Date range global filters, Top 5 summary KPI cards (`Engagement Rate`, `Total Reach`, `Total Followers`, `Posts in Period`, `Best Post` badge), 4 distribution bar charts (`Posts per Platform`, `Posts over Time`, `Likes per Platform`, `Likes over Time`), interactive multi-metric line/area chart (`Engagement Over Time`) with toggle pills, 7-day x 24-hour `Best Time to Post` density heatmap, Audience Demographics panel, Platform Breakdown data table, and Top Performing Posts ranking table.
  * **Multi-Account Platform Normalization & Real Data Sync**: Added platform key normalization (`normalizePlatformKey`) so connected Meta/Facebook channels (e.g. `facebook_page`, `meta`) properly map to Facebook in the sidebar and Real Data feed. Added multi-query fetching (`GET /v1/posts`, `source=zernio`, `source=external`) and fallback channel post generation so connected social channels display active content and performance metrics in Real Data mode.
* **Linkable Post Inspection & Live Comments Stream**: Clicking any social post card (in the list or inside the slideout drawer) opens a linkable post inspection view (`#social_media/post/{postId}`) with direct link copying, post overview, and an interactive comments stream featuring user avatars, timestamps, likes, and a live reply form.
* **Resilient Dynamic Module Import Handling**: Implemented a `safeLazy` wrapper around all React lazy-loaded view routes (`SettingsView`, `SocialMediaView`, `AutomationView`, etc.) in `App.tsx` that gracefully catches chunk loading errors (`Failed to fetch dynamically imported module`) caused by Docker container rebuilds and automatically refreshes the client tab to fetch the latest assets seamlessly.
* **Dedicated Full-Screen Post & Comments Workspace View**:
  - Replaced the pop-up modal with a full 2-column workspace view for inspecting social media posts (`#social_media/post/{postId}`).
  - **Left Column**: Authentic native social post card (styled like Twitter/X, Instagram, LinkedIn, TikTok, etc.) with original media attachments, external platform links, and engagement analytics (Likes, Comments, Shares, Impressions, Engagement Rate).
  - **Right Column**: Interactive live comments stream feed and reply form.
  - **Header Bar**: Navigation back button (`← Back to Social Media Hub`), route link pill, and one-click link copying.
* **Footer Version Bump**: Updated version to 1.7.60 ("Huckleberry").
* **Navigation Layout Persistence**: Fixed user `id` mapping in `sync.php` and `public/sync.php` so user metadata (including custom navigation ordering `navLayout`) persists reliably in the MySQL database across page reloads and container rebuilds.
* **Infinite User State Update Loop**: Fixed an issue in `applyServerData` where comparing client-side parsed metadata objects with server-side JSON metadata strings caused `currentUser` to continuously update on every background polling tick.
* **Deep Path Navigation Reset**: Fixed the router in `App.tsx` and `Sidebar.tsx` to correctly preserve and highlight deep path suffixes and parameters (e.g., `#meetings/new`, `#meetings/123`, `#settings/branding`) instead of truncating them to base tabs.
