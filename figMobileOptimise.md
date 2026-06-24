# CCRM Mobile Layout Audit & Optimization Plan

We performed a comprehensive visual mobile layout audit of the CCRM application at a simulated mobile resolution of **375x812** (iPhone X/13/14 portrait). Below are key findings, UX issues identified from the screenshots, and optimization recommendations.

---

## 1. Global Navigation & Header Layout
### Issues Identified:
- **Badge Overlap & Title Clipping**: The `DEMO MODE` badge and the page actions (e.g. create buttons) push the main page titles (like `OBCHODNÁ PIPELINE A LEADY` and `ADRESÁR KLIENTOV`) into cramped spaces, causing awkward multi-line wrapping (e.g., "A" wrapping alone on a line in Clients).
- **Desktop Header Proportions**: Header fonts are too large for a 375px viewport, leaving very little room for content.

### Recommendations:
- **Responsive Page Titles**: Reduce the font size of page titles from `text-xl` to `text-lg` or `text-md` on viewports under `640px`.
- **Badge Repositioning**: Place the `DEMO MODE` status indicator on a separate sub-row or integrate it as a smaller indicator icon next to the system name.
- **Header Actions**: Collapse header action buttons (Create, Edit) into a floating action button (FAB) in the bottom-right corner of the viewport on mobile devices.

---

## 2. Task Dashboard & Calendar View
### Issues Identified:
- **Cramped Calendar Switcher**: The navigation controls (`< JÚN 2026 >`) and the `KALENDÁR` switch button are placed side-by-side, leaving minimal tap target area and causing tight horizontal squishing.
- **Vertical Spacing**: High vertical padding on cards pushes task lists below the viewport fold.

### Recommendations:
- **Calendar Sub-navigation**: Stack the month navigation bar and the view switcher button vertically on screens below `480px`.
- **Target Sizes**: Increase the height of the calendar navigation arrows to a minimum of `44px` to meet tap target accessibility standards (a11y).

---

## 3. Leads Pipeline (Kanban & List)
### Issues Identified:
- **Cramped Stage Filter Bubbles**: The pipeline stage filters (`NEW 1`, `CONTACTED 3`, etc.) wrap onto multiple rows, cluttering the top of the interface.
- **Search & Filter Density**: The search input and the filter toggle button take up almost `150px` of vertical space.

### Recommendations:
- **Horizontal Scrollable Stages**: Place the stage filter bubbles in a horizontally scrollable container (`flex-row overflow-x-auto whitespace-nowrap scrollbar-none`) with fading edge overlays.
- **Collapsible Search**: Combine the filter button and search bar into a single row, or hide filters behind a slide-up bottom sheet modal.

---

## 4. Clients Registry
### Issues Identified:
- **None Fallbacks**: Empty fields display literal `None None` text under client titles.
- **Information Density**: Client cards are tall, meaning only 1.5 cards fit on the screen at a time.

### Recommendations:
- **Template Fallback Handling**: Ensure that if metadata (like city, email, phone) is missing, the template hides the text nodes entirely rather than rendering `None`.
- **Card Compression**: Reduce vertical padding within the client lists. Combine details like email and phone into a single line using bullet separators (e.g. `email@domain.com • +421...`).

---

## 5. RAG AI Assistant
### Issues Identified:
- **Missing Submit Button**: The message input box (`Napíšte svoju správu...`) relies on physical keyboard `Enter` actions. On mobile virtual keyboards, this can be unintuitive.

### Recommendations:
- **Send Icon**: Integrate a prominent floating send icon (e.g., paper-plane) on the right side of the input field.

---

## 6. Email Client
### Issues Identified:
- **Clipped Filters**: Thread filter selectors (`All Threads`, `Unread`, `FONT SIZE`) clip and overlap.
- **Desktop Split-Pane Layout**: The thread detail pane renders directly underneath the list, resulting in double-scrollbars and cramped reading sections.

### Recommendations:
- **Mobile Navigation Pattern**: Switch from a split-pane layout to a single-pane stack navigation layout on viewports under `768px`.
  - Clicking a thread should open a full-screen message reader overlay.
  - Add a prominent "Back to Inbox" button at the top of the reader.

---

## 7. Trezor / Files Vault
### Issues Identified:
- **Cramped Columns**: The document table tries to fit `NÁZOV SÚBORU DOKUMENTU`, `TYP DOKUMENTU`, and `PRIRADENÝ KLIENT` side-by-side, resulting in squished, unreadable text.

### Recommendations:
- **Card Conversion**: Convert the data table into a responsive vertical list on mobile. Each file should render as a separate card showing the icon, filename, document type badge, and linked client inline.

---

## 8. System Settings View
### Issues Identified:
- **Appended Forms**: The settings categories menu is displayed as a list, but selecting a category loads the configuration form *below* the list. Users must scroll all the way to the bottom of the page to find the inputs.

### Recommendations:
- **Category Navigation Drawer**: On mobile, treat settings categories as list links. Clicking a category should open the form as a clean slide-over view or temporarily hide the menu list. Add a back button to return to the categories index.
