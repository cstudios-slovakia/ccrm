# Hold-to-confirm + Undo — inventory

Every place in the UI where a persisted entity is archived or deleted, how it is
confirmed now, and how Undo works. This file is the checklist; keep it in step
with the code. All entries below are **done**.

## How it works

- **Hold** — `src/components/ui/HoldToConfirm.tsx`: `useHoldToConfirm` and
  `<HoldToConfirmButton>`. 500 ms, one `requestAnimationFrame` clock, fires once.
  A click or an early release shows a "Hold to delete/archive" hint and does
  nothing. `instant` renders a plain button for removals that are only a draft.
- **Undo toast** — `window.showUndoToast` (App.tsx, its own slot so an ordinary
  toast can never replace it), `src/components/ui/UndoToast.tsx`, queue logic in
  `src/utils/undoQueue.ts`. 6 s, pauses on hover/focus, `Ctrl/Cmd+Z` outside
  inputs. Expiry, ×, a newer undo toast, `pagehide`, `visibilitychange → hidden`
  and logout all **commit**.
- **Entry point for call sites** — `runUndoable` (`src/utils/undoable.ts`);
  wrappers in `recordActions.ts` (any collection), `taskActions.ts`,
  `leadActions.ts`, `errorLogs.ts`. Wording in `undoMessages.ts`.
- **Strategy B plumbing** — `src/utils/pendingDeletions.ts` + `syncDiff.ts`: the
  push leaves held ids out of `deleted`, keeps them in the baseline, re-attaches
  them under protocol v1 (omission = delete) and hides them from server pulls.

### Undo strategies

| | What happens on hold | Undo | Commit |
|---|---|---|---|
| **A** archive / field change | fields flipped through the normal setter | snapshot of the exact previous values (or the removed item at its old index) written back | nothing |
| **B** sync-backed delete | record (and cascade children) removed from state; server delete held back | records reinserted at their original index; nothing was ever sent | ids released, push flushed |
| **C** direct endpoint / deferred apply | item hidden or removed locally | un-hide | the endpoint is called (or the real change applied); failure restores the item and shows the server message |

Tasks are **B + C**: `/api/task.php` deletes them (sync ignores task omissions),
and the pending registry keeps them out of pulls meanwhile.

## Entries

### Tasks
| Where | Entity | Action | Strategy |
|---|---|---|---|
| `TaskDashboardView` archive icon (mobile + desktop card) | task | archive | A |
| `TaskDashboardView` bulk toolbar — Archive | tasks | archive, bulk | A |
| `TaskDashboardView` bulk toolbar — Delete | tasks | delete, bulk | B+C |
| `TaskDashboardView` Done tab row / Archived tab row — delete | task | delete | B+C |
| `TaskEditDrawer` Archive (hold; Unarchive stays a click) | task | archive | A |
| `TaskEditDrawer` Delete | task | delete | B+C |
| `EntityTasksPanel` row delete (lead / client / project task lists) | task | delete | B+C |
| `LeadsDatagrid` gate-task delete | task | delete | B+C (404 tolerated) |

### Leads and clients
| Where | Entity | Action | Strategy |
|---|---|---|---|
| `LeadsDatagrid` detail header, table row, card, kanban hover — Delete (×4) | lead | delete | B (`leads`) |
| `LeadsDatagrid` bulk toolbar — Archive | leads | archive, bulk | A |
| `LeadsDatagrid` timeline event delete (×3 layouts) | event | delete | A (event reinserted; imported mail un-hidden) |
| `LeadsDatagrid` / `ClientsView` voice note remove (`removeAudioFile`) | recording | delete | A (player state restored; the uploaded file is never touched) |
| `ClientsView` client archive — header button and list row | client | archive | A (all lead rows of the profile) |
| `ClientsView` client invoice delete | finance record | delete | B (`financialRecords`) |
| `ClientsView` detach document | timeline event | delete | A |
| `ClientCategories` category delete | category + subcategories | delete | B (`clientCategories`); clients re-filed by Undo |

### Projects
| Where | Entity | Action | Strategy |
|---|---|---|---|
| `ProjectsView` list row, mobile row, card — Archive (×3) | project | archive | A |
| `ProjectsView` list row, mobile row, card — Delete (×3) | project | delete | B (`projects`) |
| `ProjectsView` bulk toolbar — Archive | projects | archive, bulk | A |
| `ProjectDetailsView` Archive / Delete | project | archive / delete | A / B (via the list) |
| `ProjectDetailsView` financial row delete (income + expense) | finance record | delete | B |
| `ProjectDetailsView` file attribute remove, slot file remove | file | delete | A |
| `ProjectDetailsView` custom file field remove | file field | delete | A (field returns with its uploads) |
| `ProjectDetailsView` timeline event, Gantt row, checklist checkbox | event / row / item | delete | A |
| `ProjectSettings` project type delete (list + editor) | project type | delete | B (`projectTypes`) |
| `ProjectSettings` attribute, file field, timeline attribute, timeline event type — remove from a **saved** type | attribute… | delete | C — hidden, applied on commit (see below) |
| `ProjectStatusSettings` status remove | status | delete | A (status and the moved projects) |

### Meetings, files, email
| Where | Entity | Action | Strategy |
|---|---|---|---|
| `MeetingRoomView` note archive — detail and list row | meeting | archive | A |
| `MeetingRoomView` recording remove | recording | delete | A |
| `FilesView` file delete (client timeline file or project slot file) | file | delete | C (reference removed now, `/api/delete_file.php` on commit) |
| `EmailView` delete message (thread card + reader) | email | delete | C (`/api/mail_broker.php?action=delete_email` on commit) |

### Finance and invoicing
| Where | Entity | Action | Strategy |
|---|---|---|---|
| `FinancialManagementView` movement / recurring rule delete (×2) | finance record | delete | B (the recurring source's skipped dates restored too) |
| `FinancialCategoriesManager` category delete | category + subcategories | delete | B (`financialCategories`); movements re-filed by Undo |
| `InvoicingView` document delete | invoice / offer | delete | B (`invoicesOffers`); its ledger movement is kept until the window closes (`App.updateInvoicesOffersAndSync`) |

### Warehouse
| Where | Entity | Action | Strategy |
|---|---|---|---|
| `WarehouseView` product delete | product + stock | delete | B (`warehouseItems`, `warehouseStock`) |
| `WarehouseView` warehouse delete (list + modal) | warehouse + stock | delete | B (default-warehouse flag handed over and back) |
| `WarehouseView` supplier delete (list + modal) | supplier | delete | B |

### Employees
| Where | Entity | Action | Strategy |
|---|---|---|---|
| `EmployeeListView` employee delete (table + card) | employee | delete | B (`employees`) |
| `EmployeeDetailView` vacation delete | vacation | delete | B (`employeeVacations`) |
| `EmployeeDetailView` contract / document remove | file | delete | A |

### Automation, AI, simulations, unified entries
| Where | Entity | Action | Strategy |
|---|---|---|---|
| `AutomationView` workflow delete | workflow | delete | C (`/api/workflows.php?action=delete` on commit) |
| `RagAiView` agent delete, decision delete, reset chat history | agent / decision / conversation | delete | C (`/api/chat_rag.php` on commit) |
| `SaiModule` simulation delete | simulation | delete | C (`deleteServerSimulation` on commit) |
| `UnifiedEntryView` row / folder delete (folder takes its contents) | record(s) | delete | B (`unifiedEntriesData:<id>`) |
| `SettingsView` unified-entry registry archive | unified entry | archive | A |

### Settings and navigation layout
| Where | Entity | Action | Strategy |
|---|---|---|---|
| `SettingsView` division, lead state, lead source, lead category, task state remove | list item (+ colours, groups, parents, auto-create rule) | delete | A (targeted: item at its old index, its colour/group/parent entries) |
| `SettingsView` user delete | user | delete | B (`users`) |
| `SettingsView` custom role delete | role | delete | A (`roles` is always pushed whole) |
| `SettingsView` AI template delete | template | delete | B (`aiCustomTemplates`) |
| `SettingsView`, `PersonalSettingsView`, App crash screen — Clear error logs | logs | delete | C (`DELETE /api/error_logs.php` on commit) |
| `StartMenu`, `SidebarSettings`, `Sidebar` — delete group | group | delete | A (layout snapshot; items moved, not lost) |

**Totals:** 90 `<HoldToConfirmButton>` call sites in 30 files (a few of them render a
plain button for the restore direction or for drafts), covering the 51 rows above —
by strategy: A 22 (one of them A/B), B 17, C 7, B+C 5 (tasks). Counted per row of the
tables, not per physical button.

## Excluded (kept as they are)

| Where | Why |
|---|---|
| `LicenseSettings` remove licence | licensing action — keeps its confirmation (`.agents/rules/licensing.md`) |
| `PersonalSettingsView` revoke MCP key, `SettingsView` reset API key, reset Zernio key | security / credential actions — keep their confirmation |
| `SettingsView` wipe demo data, reset CRM storage; `PersonalSettingsView` clear browser cache | whole-installation or client-side resets, not removal of a record |
| `DynamicDashboardView` widget remove, `WidgetSettingsDrawer` Remove, "replace with default dashboard" | edits of `tempLayout`, persisted only by the dashboard's explicit Save |
| `AutomationView` node / edge / trigger tag / condition rule remove | the workflow canvas is a draft until Save |
| `ProjectSettings` attribute / file field / timeline attribute / event type remove on a **new** (unsaved) type; attribute option remove; "discard unsaved type" | draft; the button is `instant` (plain click) there |
| `ProjectDetailsView` remove a manager from the project | unassigning, not deleting a record |
| `LeadsDatagrid` `handleUnpairProject` | unlinks a project from a lead; nothing is archived or deleted |
| `LeadsDatagrid` / `FilesView` / `UnifiedEntryView` / `EmployeeFormModal`+`Screen` queued or draft file removal | file in an upload queue or an unsaved form |
| `WarehouseView` issue / receipt / transfer row remove; item form image / category chips | rows of an unsaved stock document / unsaved product form |
| `InvoicingView` line-item remove | line of a document being edited |
| `EmployeeSettingsModal` / `Screen` salary and vacation type remove, `SalaryCellDrawer` item remove | drafts persisted by the form's Save |
| `SettingsView` remove logo | billing form draft |
| `FinancialManagementView` "Reset to Auto" (weekly calibration) | resets a setting to its default |
| `StartMenu` / `SidebarSettings` "Reset to defaults" | resets a layout, deletes no record |
| `StatusValueEquationStats` / `GroupedStatusValueEquationStats` "Clear all" | deselects statuses in a widget (a toggle) |
| `FavoritesDrawer` remove favourite, `Sidebar` remove from sidebar | favourite / pin toggles |
| `CreateRehearsalView` remove context document | draft of a simulation not yet run |
| `BlockEditor` block delete | rich-text editing |
| `CopilotSidebar` `delete_project` | AI tool call, no UI button |
| `browserNotifications` unsubscribe | push subscription, not a record |

## Not lossless

- **Invoice delete + its ledger movement.** The movement is kept while the undo
  window is open and cleaned up when it closes, so the common case is lossless.
  If the app is closed during the window the movement is removed by the next
  invoice save instead.
- **Attribute / file field / timeline attribute / event type of a saved project
  type.** Lossless *because* the removal is deferred: the server drops the stored
  values the moment the change is pushed, which no Undo could reverse. The item
  disappears from the editor at once, but the type is not changed until the window
  closes. Leaving the settings screen inside the window does not cancel it.
- **Undo of a delete whose server call already failed** restores the item locally
  and shows the server's message; if the server had partly deleted (several tasks,
  some refused) only the refused ones come back.
- **Pull while held:** a record held back for Undo is hidden from the poller's
  answer, so a second browser sees it until the window closes. This is intended
  (the server still has it).
