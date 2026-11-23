import React, { useEffect, useId, useState } from "react";
import type { Language } from "../../utils/translations";
import { normalizeGithubBranch, normalizeGithubRepo } from "../../utils/githubRepo";

const inputCls =
  "w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-body font-bold text-gray-800 placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-emerald-500 transition-all read-only:bg-transparent read-only:border-transparent read-only:pl-0 aria-[invalid=true]:border-rose-400";

/**
 * "GitHub" group in the project detail's left card: the repository ("owner/name") the project is paired
 * with and the server branch whose pushes count (empty = the repository's default branch). Each field
 * keeps its own draft and hands a value up only on blur / Enter, once it is valid or empty, so the
 * project's autosave never writes half a repository name; a pasted URL is reduced to owner/name first.
 * Read-only for people who cannot edit the project.
 */
export const ProjectGithubFields: React.FC<{
  userLanguage: Language;
  repo: string;
  branch: string;
  canEdit: boolean;
  onRepoChange: (repo: string) => void;
  onBranchChange: (branch: string) => void;
}> = ({ userLanguage, repo, branch, canEdit, onRepoChange, onBranchChange }) => {
  const t = (en: string, sk: string, hu: string) => (userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en);
  const id = useId();
  const [repoDraft, setRepoDraft] = useState(repo);
  const [branchDraft, setBranchDraft] = useState(branch);
  const [repoInvalid, setRepoInvalid] = useState(false);
  const [branchInvalid, setBranchInvalid] = useState(false);

  // The project (re)loaded or was saved: what is stored replaces the draft.
  useEffect(() => {
    setRepoDraft(repo);
    setRepoInvalid(false);
  }, [repo]);
  useEffect(() => {
    setBranchDraft(branch);
    setBranchInvalid(false);
  }, [branch]);

  const commitRepo = () => {
    if (repoDraft.trim() === "") {
      setRepoInvalid(false);
      setRepoDraft("");
      onRepoChange("");
      return;
    }
    const normalized = normalizeGithubRepo(repoDraft);
    setRepoInvalid(normalized === null);
    if (normalized === null) return;
    setRepoDraft(normalized);
    onRepoChange(normalized);
  };
  const commitBranch = () => {
    if (branchDraft.trim() === "") {
      setBranchInvalid(false);
      setBranchDraft("");
      onBranchChange("");
      return;
    }
    const normalized = normalizeGithubBranch(branchDraft);
    setBranchInvalid(normalized === null);
    if (normalized === null) return;
    setBranchDraft(normalized);
    onBranchChange(normalized);
  };
  const enterCommits = (commit: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="block type-overline text-gray-400 mb-1 p-0">GitHub</legend>
      <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor={`${id}-repo`} className="block type-label text-gray-600 mb-1">
            {t("Repository", "Repozitár", "Repozitórium")}
          </label>
          <input
            id={`${id}-repo`}
            type="text"
            value={repoDraft}
            readOnly={!canEdit}
            onChange={(e) => setRepoDraft(e.target.value)}
            onBlur={commitRepo}
            onKeyDown={enterCommits(commitRepo)}
            placeholder={canEdit ? "owner/name" : "—"}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={repoInvalid}
            aria-describedby={repoInvalid ? `${id}-repo-error` : undefined}
            className={inputCls}
          />
          {repoInvalid && (
            <p id={`${id}-repo-error`} className="mt-1 text-caption text-rose-600">
              {t("Enter the repository as owner/name.", "Zadajte repozitár v tvare vlastník/názov.", "Adja meg a repozitóriumot tulajdonos/név alakban.")}
            </p>
          )}
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-branch`} className="block type-label text-gray-600 mb-1">
            {t("Branch", "Vetva", "Ág")}
          </label>
          <input
            id={`${id}-branch`}
            type="text"
            value={branchDraft}
            readOnly={!canEdit}
            onChange={(e) => setBranchDraft(e.target.value)}
            onBlur={commitBranch}
            onKeyDown={enterCommits(commitBranch)}
            placeholder={canEdit ? t("default branch", "predvolená vetva", "alapértelmezett ág") : "—"}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={branchInvalid}
            aria-describedby={branchInvalid ? `${id}-branch-error` : undefined}
            className={inputCls}
          />
          {branchInvalid && (
            <p id={`${id}-branch-error`} className="mt-1 text-caption text-rose-600">
              {t("A branch name has no spaces.", "Názov vetvy nesmie obsahovať medzery.", "Az ág neve nem tartalmazhat szóközt.")}
            </p>
          )}
        </div>
      </div>
      {canEdit && (
        <p className="mt-1 text-caption text-gray-400">
          {t(
            "Pushes to this branch count as deployments to the server.",
            "Pushe do tejto vetvy sa počítajú ako nasadenia na server.",
            "Az erre az ágra érkező pushok szerver-telepítésnek számítanak.",
          )}
        </p>
      )}
    </fieldset>
  );
};
