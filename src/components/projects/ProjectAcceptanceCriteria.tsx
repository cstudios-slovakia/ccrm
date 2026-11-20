import { useEffect, useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import type { AcceptanceCriterion, Project } from "../../types";
import type { Language } from "../../utils/translations";
import { formatDateLocalized } from "../../utils/localTime";
import {
  addCriterion,
  approveScope,
  countCriteria,
  isAddedAfterApproval,
  liveCriteria,
  removeCriterion,
  renameCriterion,
  toggleCriterionDone,
  withdrawScopeApproval,
} from "../../utils/acceptanceCriteria";
import { parseAppDate, toIsoDay } from "../../utils/performance/period";
import { addedAfterApprovalCount, countNoun, makeT } from "../dashboard/performance/format";
import { EmptyState, Surface } from "../layout";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";

/** A UTC instant as the local calendar day the user sees, in the app's date format. */
const localDay = (iso: string | null | undefined, language: Language): string => {
  const date = parseAppDate(iso);
  return date ? formatDateLocalized(toIsoDay(date), language) : "";
};

/** The title of one criterion: edited in place, saved on Enter or when the field loses focus. */
const CriterionTitle = ({
  value,
  label,
  onRename,
}: {
  value: string;
  label: string;
  onRename: (title: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onRename(next);
    else setDraft(value);
  };
  return (
    <input
      value={draft}
      maxLength={300}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className="h-9 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 text-ui font-semibold text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
    />
  );
};

/**
 * The acceptance criteria of a project and its scope approval. Criteria added after the approval
 * are scope creep (dashboard widget "Scope creep"). The criteria are part of the project: every
 * change goes out through `onPatch`, which saves the project the way the view always does.
 */
export const ProjectAcceptanceCriteria = ({
  project,
  canEdit,
  userName,
  language,
  onPatch,
}: {
  project: Project;
  canEdit: boolean;
  userName: string;
  language: Language;
  onPatch: (patch: Partial<Project>) => void;
}) => {
  const t = makeT(language);
  const [draft, setDraft] = useState("");
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const list = project.acceptanceCriteria ?? [];
  const live = liveCriteria(list);
  const approvedAt = project.scopeApprovedAt ?? null;
  const approved = !!parseAppDate(approvedAt);
  const { added } = countCriteria(list, approvedAt);

  const save = (next: AcceptanceCriterion[]) => onPatch({ acceptanceCriteria: next });
  const add = () => {
    if (!draft.trim()) return;
    save(addCriterion(list, { id: `crit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, title: draft }, userName, new Date()));
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="min-w-0">
        <h3 className="type-card-title text-slate-900">{t("Acceptance criteria", "Akceptačné kritériá", "Elfogadási kritériumok")}</h3>
        <p className="type-meta text-slate-500">
          {countNoun("criterion", live.length, language)}
          {approved && added > 0 && ` · ${addedAfterApprovalCount(added, language)}`}
        </p>
      </div>

      <Surface tone="inset" padding="none" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        {approved ? (
          <>
            <p className="type-meta text-slate-600">
              {t("Scope approved", "Rozsah schválený", "Terjedelem jóváhagyva")} {localDay(approvedAt, language)}
              {project.scopeApprovedBy ? ` · ${project.scopeApprovedBy}` : ""}
            </p>
            {canEdit &&
              (confirmingWithdraw ? (
                <div className="flex items-center gap-2">
                  <span className="type-meta text-slate-600">
                    {t("Withdraw the approval?", "Zrušiť schválenie?", "Visszavonja a jóváhagyást?")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingWithdraw(false);
                      onPatch(withdrawScopeApproval());
                    }}
                    className="h-8 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t("Withdraw approval", "Zrušiť schválenie", "Jóváhagyás visszavonása")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingWithdraw(false)}
                    className="h-8 cursor-pointer rounded-xl px-3 text-ui font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    {t("Keep", "Ponechať", "Megtartom")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingWithdraw(true)}
                  className="h-8 cursor-pointer rounded-xl px-3 text-ui font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {t("Withdraw approval", "Zrušiť schválenie", "Jóváhagyás visszavonása")}
                </button>
              ))}
          </>
        ) : (
          <>
            <p className="type-meta min-w-0 flex-1 text-slate-600">
              {t(
                "After approval every new criterion counts as a scope extension.",
                "Po schválení sa každé nové kritérium počíta ako rozšírenie rozsahu.",
                "Jóváhagyás után minden új kritérium a terjedelem bővítésének számít.",
              )}
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() => onPatch(approveScope(project, userName, new Date()))}
                className="h-9 shrink-0 cursor-pointer rounded-xl bg-indigo-600 px-4 text-ui font-semibold text-white hover:bg-indigo-500"
              >
                {t("Approve scope", "Schváliť rozsah", "Terjedelem jóváhagyása")}
              </button>
            )}
          </>
        )}
      </Surface>

      {live.length === 0 ? (
        <EmptyState
          icon={<ListChecks aria-hidden="true" />}
          title={t("No criteria yet", "Zatiaľ žiadne kritériá", "Még nincsenek kritériumok")}
          body={t(
            "List what the client has to accept. Criteria added after the scope is approved show up as scope creep.",
            "Zapíšte, čo musí klient prevziať. Kritériá pridané po schválení rozsahu sa zobrazia ako rozširovanie rozsahu.",
            "Írja fel, mit kell az ügyfélnek elfogadnia. A terjedelem jóváhagyása után hozzáadott kritériumok a terjedelem bővüléseként jelennek meg.",
          )}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {live.map((criterion) => {
            const late = isAddedAfterApproval(criterion, approvedAt);
            return (
              <li key={criterion.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <input
                  type="checkbox"
                  checked={criterion.done}
                  disabled={!canEdit}
                  onChange={() => save(toggleCriterionDone(list, criterion.id))}
                  aria-label={`${t("Done", "Hotové", "Kész")}: ${criterion.title}`}
                  className="size-4 shrink-0 cursor-pointer accent-indigo-600 disabled:cursor-default"
                />
                {canEdit ? (
                  <CriterionTitle
                    value={criterion.title}
                    label={t("Criterion", "Kritérium", "Kritérium")}
                    onRename={(title) => save(renameCriterion(list, criterion.id, title))}
                  />
                ) : (
                  <span className={`min-w-0 flex-1 text-ui font-semibold ${criterion.done ? "text-slate-500" : "text-slate-800"}`}>{criterion.title}</span>
                )}
                {late && (
                  <span className="type-meta shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-700">
                    {t("Added after approval", "Pridané po schválení", "Jóváhagyás után hozzáadva")}
                  </span>
                )}
                <span className="type-meta shrink-0 text-slate-500">
                  {t("Added", "Pridané", "Hozzáadva")}: {criterion.createdBy ? `${criterion.createdBy} · ` : ""}
                  {localDay(criterion.createdAt, language)}
                </span>
                {canEdit && (
                  <HoldToConfirmButton
                    tone="danger"
                    lang={language}
                    what={criterion.title}
                    onConfirm={() => save(removeCriterion(list, criterion.id, userName, new Date()))}
                    className="flex size-8 shrink-0 items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </HoldToConfirmButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t("New criterion", "Nové kritérium", "Új kritérium")}
            placeholder={t("New criterion", "Nové kritérium", "Új kritérium")}
            className="h-9 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-ui"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-ui font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("Add", "Pridať", "Hozzáadás")}
          </button>
        </form>
      )}
    </div>
  );
};
