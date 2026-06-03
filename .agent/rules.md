# CRM Development Guidelines & UI Rules

This file documents mandatory visual layout rules, entity coloring configurations, and development specifications.

---

## 1. Sliding Panels & Drawer Rules

To maintain high consistency across all interactive views:

*   **Adding New Elements**:
    *   **Rule**: Always use a **bottom slideout drawer** (sliding up from the viewport bottom).
*   **Editing Existing Elements**:
    *   **Rule**: Always use a **right slideout drawer** (sliding in from the viewport right side).

---

## 2. Entity Color Themes

Each entity module has a strict, distinct color identity:
*   **Leads**: **Theme Blue** (`bg-blue-600`, blue badges, blue accents).
*   **Clients**: **Theme Green / Emerald** (`bg-emerald-600`, emerald badges, emerald accents).

---

## 3. Transparency & Z-Index Layering

*   **No Transparency**: Interactive drawers must have completely solid backgrounds (e.g. solid white `#ffffff` or `bg-white` inline overrides) to prevent underlying content from bleeding through and disrupting readability.
*   **Z-Index Elevation**: Slideout overlays must be layered above absolutely everything (including sticky headers, sidebars, charts, and main panels) using a master z-index of `z-[9999]` and a main relative z-index context of `relative z-40` on the layout wrapper.

---

## 4. Closing & Exit Animations (Slide Back)

*   **Dismissal Transitions**: When clicking outside of a slideout panel (on the backdrop overlay) or when clicking a discard/close action, the drawer must **not** disappear instantly.
*   **Implementation Flow**: 
    1. Set a local `isClosing` boolean state to `true`.
    2. Apply exit animations (`animate-slide-out-right` / `animate-slide-out-bottom` / `animate-fade-out`) reactively when `isClosing` is true.
    3. Trigger a `setTimeout` of `350ms` (matching the transition duration) before setting the master drawer ID or name state to `null` to safely let React unmount it *after* the animation completes.

---

## 5. Collapsible Filters Bar

*   **Default State**: The leads filtering panel must be collapsed (hidden) by default.
*   **Expansion**: It should toggle open upon clicking a prominent toggle button.
*   **Mandatory Fields**: It must display exactly five selectors in a grid layout:
    1. **Project Manager**
    2. **City**
    3. **Source**
    4. **Client Type**
    5. **State**

---

## 6. Dynamic State Color System

*   **Configurability**: State colors must be editable directly within the System Settings panel.
*   **Aesthetics**: State-related UI blocks (like the Leads Status Summary dashboard widgets and the main Datagrid state dropdowns) must style their backgrounds, text, and borders dynamically using the user's custom color mapping rather than using hardcoded CSS values.

---

## 7. Star Priority Ratings

*   **Attributes**: Each lead record contains a star rating parameter (value 1 to 5 stars).
*   **Interactivity**: Star ratings must be highly visible and directly interactive inside the main datagrid row, permitting users to change a lead's rating in-place with a single click.
*   **Access Areas**: Ratings must also be configureable inside new-lead modals (bottom drawers) and edit-lead panels (right drawers).

---

## 8. View Routing & Refresh Persistence

*   **Technology**: Always use dynamic **URL Hash Routing** (`window.location.hash`) for navigating and rendering SPA tabs. Do not use server-dependent path-based routing that would trigger 404s on page reloads when hosted statically in subdirectories.
*   **Listener**: App-level state must listen to `hashchange` events to synchronize state triggers with manual browser address updates and back/forward navigation.
*   **Redirect**: Redirect to a default tab (e.g. `#dashboard`) if no initial hash is loaded.

---

## 9. Datagrid Table Headers Styling

*   **White Background & Bold Colored Text**: The `<thead>` rows for all tables must always use a fully solid white background (`bg-white`). Heading text must be styled as bold, saturated, and color-coded matching the tab/entity's theme (e.g. blue for Leads, emerald/green for Clients, amber/brown for Files) rather than using a solid filled background color.
*   **Sticky Position**: All column headings (`<th>`) must be set to `sticky top-0 bg-white z-10` with a clean bottom border (e.g., `border-b-2 border-slate-100`) so that they stay pinned and visible at the top of the grid when scrolling.

---

## 10. Auto-Incrementing Build Versioning

*   **Rule**: The version nickname for v1.0.x is "Avocado" and must dynamically begin at `1.0.1`.
*   **Automation**: Every compile run via `npm run build` executes `node increment-version.js` to automatically parse and increment the patch version (e.g. `1.0.1` -> `1.0.2`), which is then imported and rendered in the page footer. Always compile before deploy pushes to staging.


