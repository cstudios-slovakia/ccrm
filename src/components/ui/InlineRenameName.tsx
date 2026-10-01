import React from "react";
import { Pencil } from "lucide-react";

// Inline "double-click / pencil to rename" field.
//
// IMPORTANT: this MUST live at module scope, not inside a component. When it was
// declared in SettingsView's render body React saw a brand-new component type on every parent
// re-render (each sync tick, each isSyncing toggle) and remounted the <input>,
// wiping the in-progress edit — so typing in a source/category/state name "kicked
// the user out" mid-edit. Hoisting it gives the component a stable identity.
export const InlineRenameName: React.FC<{
  value: string;
  canEdit: boolean;
  onCommit: (next: string) => void;
  renameTitle: string;
  children: React.ReactNode;
}> = ({ value, canEdit, onCommit, renameTitle, children }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setEditing(false); setDraft(value); }
        }}
        className="px-2.5 py-1 rounded-full border border-indigo-300 bg-white text-slate-800 text-xs font-black uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-indigo-400 min-w-[110px]"
      />
    );
  }
  const startEdit = () => { if (canEdit) { setDraft(value); setEditing(true); } };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span onDoubleClick={startEdit} className={canEdit ? "cursor-text" : undefined}>{children}</span>
      {canEdit && (
        <button
          type="button"
          onClick={startEdit}
          className="text-slate-300 hover:text-indigo-600 transition-colors p-1 rounded-md hover:bg-indigo-50 shrink-0"
          title={renameTitle}
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </span>
  );
};
