import React from "react";
import {
    Hash,
    User,
    UserCheck,
    Briefcase,
    FolderKanban,
    Target,
    Ticket as TicketIcon,
    CheckSquare,
} from "lucide-react";

export type MentionEntityType =
    | "user"
    | "employee"
    | "project"
    | "client"
    | "lead"
    | "ticket"
    | "task";

export interface MentionEntity {
    id: string;
    name: string;
    type: MentionEntityType;
    detail?: string;
    subtitle?: string;
}

export type ParsedTaskToken =
    | { kind: "newline"; text: string }
    | { kind: "tag"; text: string; tag: string }
    | { kind: "mention"; text: string; mentionName: string; entity?: MentionEntity }
    | { kind: "text"; text: string };

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

const ENTITY_BOUNDARY_AFTER = /[\s,;:!?)\]}\n]/;
const PRECEDING_IDENTIFIER_CHAR = /[a-zA-Z0-9_.\u00C0-\u024F\u1E00-\u1EFF]/;

/**
 * Tokenizes card/task text into plain text, newlines, `#tag`s, and `@mention`s.
 * When `knownEntities` is provided, multi-word entity names (e.g. `@Novák Stavby s.r.o.`)
 * are matched longest-first alongside underscore-escaped `@Entity_Name` forms.
 */
export function parseTaskTokens(
    text: string,
    knownEntities: MentionEntity[] = [],
): ParsedTaskToken[] {
    if (!text) return [];

    const sortedEntities = [...knownEntities]
        .filter((e) => Boolean(e.name && e.name.trim()))
        .sort((a, b) => b.name.trim().length - a.name.trim().length);

    const tokens: ParsedTaskToken[] = [];
    let plainStart = 0;
    let i = 0;

    const flushPlain = (end: number) => {
        if (end > plainStart) {
            tokens.push({ kind: "text", text: text.slice(plainStart, end) });
        }
    };

    while (i < text.length) {
        const ch = text[i];

        if (ch === "\n") {
            flushPlain(i);
            tokens.push({ kind: "newline", text: "\n" });
            i += 1;
            plainStart = i;
            continue;
        }

        if (ch === "#") {
            const match = text.slice(i).match(/^#([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+)/);
            if (match) {
                flushPlain(i);
                tokens.push({ kind: "tag", text: match[0], tag: match[1] });
                i += match[0].length;
                plainStart = i;
                continue;
            }
        }

        if (ch === "@" && (i === 0 || !PRECEDING_IDENTIFIER_CHAR.test(text[i - 1]))) {
            const afterAt = text.slice(i + 1);
            const afterAtLower = afterAt.toLowerCase();

            // 1. Try matching full entity names (longest-first, supports multi-word names)
            let matchedEntity: MentionEntity | undefined;
            let matchedLen = 0;

            for (const entity of sortedEntities) {
                const trimmedName = entity.name.trim();
                const nameLower = trimmedName.toLowerCase();
                const underscoreLower = nameLower.replace(/\s+/g, "_");

                if (afterAtLower.startsWith(nameLower)) {
                    const nextChar = afterAt[trimmedName.length];
                    if (nextChar === undefined || ENTITY_BOUNDARY_AFTER.test(nextChar)) {
                        matchedEntity = entity;
                        matchedLen = trimmedName.length;
                        break;
                    }
                } else if (underscoreLower !== nameLower && afterAtLower.startsWith(underscoreLower)) {
                    const nextChar = afterAt[underscoreLower.length];
                    if (nextChar === undefined || ENTITY_BOUNDARY_AFTER.test(nextChar)) {
                        matchedEntity = entity;
                        matchedLen = underscoreLower.length;
                        break;
                    }
                }
            }

            if (matchedEntity && matchedLen > 0) {
                flushPlain(i);
                const fullToken = text.slice(i, i + 1 + matchedLen);
                tokens.push({
                    kind: "mention",
                    text: fullToken,
                    mentionName: matchedEntity.name.trim(),
                    entity: matchedEntity,
                });
                i += fullToken.length;
                plainStart = i;
                continue;
            }

            // 2. Fallback: single-token @mention
            const fallbackMatch = text.slice(i).match(/^@([\w\u00C0-\u024F\u1E00-\u1EFF.-]+)/);
            if (fallbackMatch) {
                flushPlain(i);
                const rawName = fallbackMatch[1];
                const rawLower = rawName.toLowerCase();
                const found = knownEntities.find(
                    (e) =>
                        e.name.trim().toLowerCase() === rawLower ||
                        e.name.trim().toLowerCase().replace(/\s+/g, "_") === rawLower,
                );
                tokens.push({
                    kind: "mention",
                    text: fallbackMatch[0],
                    mentionName: found ? found.name.trim() : rawName,
                    entity: found,
                });
                i += fallbackMatch[0].length;
                plainStart = i;
                continue;
            }
        }

        i += 1;
    }

    flushPlain(text.length);
    return tokens;
}

export const MENTION_STYLE_MAP: Record<
    MentionEntityType,
    { badgeClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
    user: { badgeClass: "bg-purple-50 text-purple-700 border-purple-200", Icon: User },
    employee: { badgeClass: "bg-teal-50 text-teal-800 border-teal-200", Icon: UserCheck },
    project: { badgeClass: "bg-amber-50 text-amber-800 border-amber-200", Icon: FolderKanban },
    client: { badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200", Icon: Briefcase },
    lead: { badgeClass: "bg-sky-50 text-sky-800 border-sky-200", Icon: Target },
    ticket: { badgeClass: "bg-rose-50 text-rose-800 border-rose-200", Icon: TicketIcon },
    task: { badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200", Icon: CheckSquare },
};

interface TaskPillTextProps {
    text: string;
    onTagClick?: (tag: string) => void;
    onMentionClick?: (entity: MentionEntity | undefined, mentionName: string) => void;
    className?: string;
    knownEntities?: MentionEntity[];
}

export const TaskPillText: React.FC<TaskPillTextProps> = ({
    text,
    onTagClick,
    onMentionClick,
    className = "",
    knownEntities = [],
}) => {
    if (!text) return null;

    const tokens = parseTaskTokens(text, knownEntities);

    return (
        <span className={`inline ${className}`}>
            {tokens.map((token, index) => {
                if (token.kind === "newline") {
                    return <br key={index} />;
                }

                if (token.kind === "tag") {
                    const tag = token.tag;
                    return (
                        <span
                            key={index}
                            onClick={(e) => {
                                if (onTagClick) {
                                    e.stopPropagation();
                                    onTagClick(tag);
                                }
                            }}
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md type-overline mx-0.5 select-none transition-all ${
                                onTagClick
                                    ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 shadow-xs cursor-pointer active:scale-95"
                                    : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                            }`}
                            title={onTagClick ? `#${tag}` : undefined}
                        >
                            <Hash className="h-2.5 w-2.5 opacity-70 shrink-0" />
                            <span>{tag}</span>
                        </span>
                    );
                }

                if (token.kind === "mention") {
                    const entityType: MentionEntityType = token.entity?.type || "user";
                    const style = MENTION_STYLE_MAP[entityType] || MENTION_STYLE_MAP.user;
                    const IconComponent = style.Icon;

                    return (
                        <span
                            key={index}
                            onClick={(e) => {
                                if (onMentionClick) {
                                    e.stopPropagation();
                                    onMentionClick(token.entity, token.mentionName);
                                }
                            }}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md text-micro font-bold mx-0.5 select-none border shadow-xs ${
                                style.badgeClass
                            } ${onMentionClick ? "cursor-pointer hover:brightness-95 active:scale-95 transition-all" : ""}`}
                        >
                            <IconComponent className="h-2.5 w-2.5 opacity-70 shrink-0" />
                            <span>{token.text}</span>
                        </span>
                    );
                }

                return <React.Fragment key={index}>{token.text}</React.Fragment>;
            })}
        </span>
    );
};
