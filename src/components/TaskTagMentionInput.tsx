import React, { useState, useRef, useEffect, useCallback } from "react";
import { Hash, User, Briefcase, FolderKanban, Target } from "lucide-react";
import type { MentionEntity } from "./TaskPillText";

interface TaskTagMentionInputProps {
    value: string;
    onChange: (value: string) => void;
    multiline?: boolean;
    rows?: number;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    required?: boolean;
    maxLength?: number;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    existingTags?: string[];
    onTagAdded?: (tag: string) => void;
    mentionEntities?: MentionEntity[];
    onAssignEntity?: (entity: MentionEntity) => void;
}

type AutocompleteMode = "none" | "tag" | "mention";

export const TaskTagMentionInput: React.FC<TaskTagMentionInputProps> = ({
    value,
    onChange,
    multiline = false,
    rows = 3,
    placeholder,
    className = "",
    disabled = false,
    autoFocus = false,
    required = false,
    maxLength,
    onKeyDown,
    existingTags = [],
    onTagAdded,
    mentionEntities = [],
    onAssignEntity,
}) => {
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [mode, setMode] = useState<AutocompleteMode>("none");
    const [query, setQuery] = useState("");
    const [triggerStartIndex, setTriggerStartIndex] = useState<number>(-1);
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Compute matching suggestions based on active mode
    const tagSuggestions = React.useMemo(() => {
        if (mode !== "tag") return [];
        const q = query.toLowerCase().trim();
        const filtered = existingTags.filter((t) => t.toLowerCase().includes(q));
        // If user typed a query that is not yet in existingTags, also offer to create it
        if (q && !existingTags.some((t) => t.toLowerCase() === q)) {
            return [q, ...filtered];
        }
        return filtered;
    }, [mode, query, existingTags]);

    const mentionSuggestions = React.useMemo(() => {
        if (mode !== "mention") return [];
        const q = query.toLowerCase().trim();
        if (!q) return mentionEntities.slice(0, 15);
        return mentionEntities
            .filter(
                (e) =>
                    e.name.toLowerCase().includes(q) ||
                    (e.detail && e.detail.toLowerCase().includes(q)),
            )
            .slice(0, 15);
    }, [mode, query, mentionEntities]);

    // Keep selectedIndex in bounds
    useEffect(() => {
        setSelectedIndex(0);
    }, [tagSuggestions.length, mentionSuggestions.length, mode]);

    // Inspect text around cursor to detect # or @
    const checkTriggers = useCallback(() => {
        const el = inputRef.current;
        if (!el) return;

        const cursor = el.selectionStart ?? 0;
        const textBeforeCursor = value.slice(0, cursor);

        // Find last whitespace or start of line
        const lastSpace = Math.max(
            textBeforeCursor.lastIndexOf(" "),
            textBeforeCursor.lastIndexOf("\n"),
            textBeforeCursor.lastIndexOf("\t"),
        );
        const currentToken = textBeforeCursor.slice(lastSpace + 1);

        if (currentToken.startsWith("#")) {
            const tagQuery = currentToken.slice(1);
            // Only trigger if no illegal characters
            if (/^[\w\u00C0-\u024F\u1E00-\u1EFF-]*$/.test(tagQuery)) {
                setMode("tag");
                setQuery(tagQuery);
                setTriggerStartIndex(lastSpace + 1);
                return;
            }
        } else if (currentToken.startsWith("@")) {
            const mentionQuery = currentToken.slice(1);
            if (/^[\w\u00C0-\u024F\u1E00-\u1EFF.-]*$/.test(mentionQuery)) {
                setMode("mention");
                setQuery(mentionQuery);
                setTriggerStartIndex(lastSpace + 1);
                return;
            }
        }

        setMode("none");
        setQuery("");
        setTriggerStartIndex(-1);
    }, [value]);

    const handleSelectTag = useCallback(
        (chosenTag: string) => {
            const el = inputRef.current;
            if (!el || triggerStartIndex < 0) return;

            const cleanTag = chosenTag.trim().replace(/^#/, "");
            const cursor = el.selectionStart ?? value.length;
            const before = value.slice(0, triggerStartIndex);
            const after = value.slice(cursor);

            const inserted = `#${cleanTag} `;
            const nextValue = before + inserted + after;
            onChange(nextValue);
            onTagAdded?.(cleanTag);

            setMode("none");
            setQuery("");
            setTriggerStartIndex(-1);

            setTimeout(() => {
                el.focus();
                const newPos = before.length + inserted.length;
                el.setSelectionRange(newPos, newPos);
            }, 0);
        },
        [value, triggerStartIndex, onChange, onTagAdded],
    );

    const handleSelectMention = useCallback(
        (entity: MentionEntity) => {
            const el = inputRef.current;
            if (!el || triggerStartIndex < 0) return;

            // Replace spaces with underscores or use plain name for mention tag
            const mentionName = entity.name.trim();
            const cursor = el.selectionStart ?? value.length;
            const before = value.slice(0, triggerStartIndex);
            const after = value.slice(cursor);

            const inserted = `@${mentionName} `;
            const nextValue = before + inserted + after;
            onChange(nextValue);
            onAssignEntity?.(entity);

            setMode("none");
            setQuery("");
            setTriggerStartIndex(-1);

            setTimeout(() => {
                el.focus();
                const newPos = before.length + inserted.length;
                el.setSelectionRange(newPos, newPos);
            }, 0);
        },
        [value, triggerStartIndex, onChange, onAssignEntity],
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // If suggestion menu is open, handle arrows and Enter/Tab
        if (mode === "tag" && tagSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % tagSuggestions.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex(
                    (prev) => (prev - 1 + tagSuggestions.length) % tagSuggestions.length,
                );
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                const chosen = tagSuggestions[selectedIndex] || query;
                if (chosen) handleSelectTag(chosen);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setMode("none");
                return;
            }
            if (e.key === " ") {
                // If user hits space, commit the current tag if typed
                if (query.trim()) {
                    handleSelectTag(query.trim());
                    return;
                }
            }
        } else if (mode === "mention" && mentionSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % mentionSuggestions.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex(
                    (prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length,
                );
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                const chosen = mentionSuggestions[selectedIndex];
                if (chosen) handleSelectMention(chosen);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setMode("none");
                return;
            }
        }

        // Delegate to parent onKeyDown
        onKeyDown?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        onChange(e.target.value);
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setMode("none");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Re-check triggers whenever value or cursor moves
    useEffect(() => {
        checkTriggers();
    }, [value, checkTriggers]);

    return (
        <div ref={containerRef} className="relative w-full">
            {multiline ? (
                <textarea
                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                    rows={rows}
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onKeyUp={checkTriggers}
                    onClick={checkTriggers}
                    placeholder={placeholder}
                    className={className}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    required={required}
                    maxLength={maxLength}
                />
            ) : (
                <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="text"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onKeyUp={checkTriggers}
                    onClick={checkTriggers}
                    placeholder={placeholder}
                    className={className}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    required={required}
                    maxLength={maxLength}
                />
            )}

            {/* TAGS AUTOCOMPLETE POPOVER */}
            {mode === "tag" && tagSuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-72 max-h-56 overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl border border-indigo-200 shadow-2xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-indigo-500 border-b border-indigo-100 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            <span>Tags</span>
                        </span>
                        <span className="text-[8px] text-slate-400 font-normal">
                            Tab / Enter / Space
                        </span>
                    </div>

                    <div className="py-1">
                        {tagSuggestions.map((tag, idx) => {
                            const isNew = !existingTags.includes(tag);
                            const isSelected = idx === selectedIndex;
                            return (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => handleSelectTag(tag)}
                                    className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-colors ${
                                        isSelected
                                            ? "bg-indigo-600 text-white shadow-sm"
                                            : "hover:bg-indigo-50 text-slate-700"
                                    }`}
                                >
                                    <span className="flex items-center gap-1.5 truncate">
                                        <Hash className={`h-3 w-3 ${isSelected ? "text-indigo-200" : "text-indigo-500"}`} />
                                        <span>{tag}</span>
                                    </span>
                                    {isNew ? (
                                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                                            isSelected ? "bg-indigo-500 text-white" : "bg-indigo-100 text-indigo-700"
                                        }`}>
                                            New tag
                                        </span>
                                    ) : (
                                        <span className={`text-[9px] ${isSelected ? "text-indigo-200" : "text-slate-400"}`}>
                                            existing
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ENTITY MENTIONS AUTOCOMPLETE POPOVER */}
            {mode === "mention" && mentionSuggestions.length > 0 && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-80 max-h-64 overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-2xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 flex items-center justify-between">
                        <span>Mention & Assign Entity</span>
                        <span className="text-[8px] text-slate-400 font-normal">
                            Tab / Enter
                        </span>
                    </div>

                    <div className="py-1 space-y-0.5">
                        {mentionSuggestions.map((entity, idx) => {
                            const isSelected = idx === selectedIndex;
                            let colorClasses = "text-purple-600 bg-purple-50";
                            let IconComponent = User;
                            let typeLabel = "Team";

                            if (entity.type === "project") {
                                colorClasses = "text-amber-600 bg-amber-50";
                                IconComponent = FolderKanban;
                                typeLabel = "Project";
                            } else if (entity.type === "client") {
                                colorClasses = "text-emerald-600 bg-emerald-50";
                                IconComponent = Briefcase;
                                typeLabel = "Client";
                            } else if (entity.type === "lead") {
                                colorClasses = "text-sky-600 bg-sky-50";
                                IconComponent = Target;
                                typeLabel = "Lead";
                            }

                            return (
                                <button
                                    key={`${entity.type}-${entity.id}`}
                                    type="button"
                                    onClick={() => handleSelectMention(entity)}
                                    className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-colors ${
                                        isSelected
                                            ? "bg-slate-900 text-white shadow-sm"
                                            : "hover:bg-slate-50 text-slate-700"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`p-1 rounded-lg ${isSelected ? "bg-white/20 text-white" : colorClasses}`}>
                                            <IconComponent className="h-3 w-3" />
                                        </div>
                                        <div className="truncate">
                                            <span className="block truncate leading-tight font-black">
                                                {entity.name}
                                            </span>
                                            {entity.detail && (
                                                <span className={`text-[9px] block truncate font-medium ${
                                                    isSelected ? "text-slate-300" : "text-slate-400"
                                                }`}>
                                                    {entity.detail}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0 ml-2 ${
                                        isSelected ? "bg-white/20 text-white" : colorClasses
                                    }`}>
                                        {typeLabel}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
