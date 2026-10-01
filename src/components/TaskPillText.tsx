import React from "react";
import { Hash, User, Briefcase, FolderKanban, Target } from "lucide-react";

export interface MentionEntity {
    id: string;
    name: string;
    type: "user" | "project" | "client" | "lead";
    detail?: string;
}

/**
 * Extracts all unique #tags from a text string.
 * Supports letters, numbers, underscores, and hyphens (e.g. #urgent, #client_review, #v1-release).
 */
export function extractTagsFromText(text: string): string[] {
    if (!text) return [];
    const matches = text.match(/#([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+)/g);
    if (!matches) return [];
    const unique = new Set(matches.map((m) => m.slice(1).trim()).filter(Boolean));
    return Array.from(unique);
}

interface TaskPillTextProps {
    text: string;
    onTagClick?: (tag: string) => void;
    className?: string;
    knownEntities?: MentionEntity[];
}

export const TaskPillText: React.FC<TaskPillTextProps> = ({
    text,
    onTagClick,
    className = "",
    knownEntities = [],
}) => {
    if (!text) return null;

    // Tokenize by spaces and line breaks while keeping delimiters
    // Matches #tag or @mention or normal words
    const regex = /(#[\w\u00C0-\u024F\u1E00-\u1EFF-]+|@[\w\u00C0-\u024F\u1E00-\u1EFF.-]+|\n|[^\s#@\n]+|\s+)/g;
    const tokens = text.match(regex) || [text];

    return (
        <span className={`inline ${className}`}>
            {tokens.map((token, index) => {
                if (token === "\n") {
                    return <br key={index} />;
                }

                // Hashtag pill (#tag)
                if (token.startsWith("#") && token.length > 1) {
                    const tag = token.slice(1);
                    return (
                        <span
                            key={index}
                            onClick={(e) => {
                                if (onTagClick) {
                                    e.stopPropagation();
                                    onTagClick(tag);
                                }
                            }}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[10px] font-black uppercase tracking-wider mx-0.5 select-none transition-all ${
                                onTagClick
                                    ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 shadow-xs cursor-pointer active:scale-95"
                                    : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            }`}
                            title={`Filter archive by #${tag}`}
                        >
                            <Hash className="h-2.5 w-2.5 opacity-70 shrink-0" />
                            <span>{tag}</span>
                        </span>
                    );
                }

                // Mention pill (@entity)
                if (token.startsWith("@") && token.length > 1) {
                    const mentionName = token.slice(1).toLowerCase();
                    const matchedEntity = knownEntities.find(
                        (e) =>
                            e.name.toLowerCase() === mentionName ||
                            e.name.toLowerCase().replace(/\s+/g, "_") === mentionName,
                    );

                    const entityType = matchedEntity?.type || "user";

                    let badgeClass = "bg-purple-50 text-purple-700 border-purple-200";
                    let IconComponent = User;

                    if (entityType === "project") {
                        badgeClass = "bg-amber-50 text-amber-800 border-amber-200";
                        IconComponent = FolderKanban;
                    } else if (entityType === "client") {
                        badgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
                        IconComponent = Briefcase;
                    } else if (entityType === "lead") {
                        badgeClass = "bg-sky-50 text-sky-800 border-sky-200";
                        IconComponent = Target;
                    }

                    return (
                        <span
                            key={index}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-bold mx-0.5 select-none border shadow-xs ${badgeClass}`}
                        >
                            <IconComponent className="h-2.5 w-2.5 opacity-70 shrink-0" />
                            <span>{token}</span>
                        </span>
                    );
                }

                // Normal text
                return <React.Fragment key={index}>{token}</React.Fragment>;
            })}
        </span>
    );
};
