import type { Language } from "../../utils/translations";
import type { NoteActivity } from "../../utils/noteActivity";
import { EntityNotes } from "./EntityNotes";

/** The project card's Notes tab (or, in the drawer, its Notes section): the project's notes, scrolling on their own. */
export const ProjectNotesSection = ({
  projectId,
  language,
  author,
  canEdit,
  canDelete,
  onActivity,
}: {
  projectId: string;
  language: Language;
  author?: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Puts the note's trace on the project timeline (saved with the project). */
  onActivity: (trace: NoteActivity) => void;
}) => (
  <div className="flex-1 ws-lg:overflow-y-auto ws-lg:pr-1 animate-in fade-in duration-150">
    <EntityNotes
      entityType="project"
      entityId={projectId}
      language={language}
      author={author}
      canEdit={canEdit}
      canDelete={canDelete}
      onActivity={onActivity}
    />
  </div>
);
