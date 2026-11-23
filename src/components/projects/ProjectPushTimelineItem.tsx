import React from "react";
import { Clock, GitBranch } from "lucide-react";
import type { Language } from "../../utils/translations";
import { formatTimestampLocalized } from "../../utils/localTime";
import { isGithubCompareUrl } from "../../utils/githubRepo";
import type { PushTimelineItem } from "../../utils/projectPushTimeline";
import { firstLine } from "../../utils/projectPushTimeline";
import { countNoun, makeT } from "../dashboard/performance/format";

/**
 * A GitHub push as a read-only item of the project timeline: no edit, no delete, never saved with the
 * project. Branch, pusher and commit message come from a webhook payload, so they are rendered as plain
 * text only, and the link is shown only for a verified GitHub compare or commit URL.
 */
export const ProjectPushTimelineItem: React.FC<{ item: PushTimelineItem; language: Language }> = ({ item, language }) => {
  const t = makeT(language);
  const { push } = item;
  const subject = firstLine(push.headMessage);
  const meta = [push.branch, push.commitCount > 0 ? countNoun("commit", push.commitCount, language) : "", push.pusher ?? ""].filter(Boolean);
  return (
    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm text-ui font-semibold relative flex gap-3.5 animate-fade-in">
      <div className="p-2.5 rounded-xl bg-white border border-slate-200 shrink-0 self-start shadow-sm">
        <GitBranch className="h-4 w-4 text-slate-600" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-800 text-ui font-bold">{t("Push to server", "Push na server", "Push a szerverre")}</span>
          <span className="text-micro text-slate-500 font-medium flex items-center gap-1 shrink-0">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatTimestampLocalized(item.timestamp, language)}
          </span>
        </div>
        {meta.length > 0 && <p className="type-meta mt-0.5 text-slate-500 break-words">{meta.join(" · ")}</p>}
        {subject && <p className="text-slate-500 font-medium mt-1 leading-relaxed break-words">{subject}</p>}
        {isGithubCompareUrl(push.compareUrl) && (
          <a
            href={push.compareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="type-meta mt-1.5 inline-block text-indigo-600 hover:underline"
          >
            {t("View on GitHub", "Zobraziť na GitHube", "Megtekintés a GitHubon")}
          </a>
        )}
      </div>
    </div>
  );
};

/** One quiet line under the timeline when the pushes could not be read; the project's own events still show. */
export const ProjectPushesFailedNote: React.FC<{ language: Language }> = ({ language }) => (
  <p className="type-meta text-slate-500">
    {makeT(language)("GitHub pushes could not be loaded.", "Pushe z GitHubu sa nepodarilo načítať.", "A GitHub push-okat nem sikerült betölteni.")}
  </p>
);
