import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Car,
  Flag,
  Heart,
  Lightbulb,
  Loader2,
  Search,
  Smile,
  Sparkles,
  Trophy,
  User,
  Utensils,
  X,
} from "lucide-react";
import { composerMessages, type ComposerMessages } from "./composerI18n.ts";

export interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  t?: ComposerMessages;
  className?: string;
}

interface EmojiSection {
  key: string;
  emojis: Array<[emoji: string, name: string, keywords: string]>;
}

interface EmojiData {
  source: string;
  sections: EmojiSection[];
}

let cachedEmojiData: EmojiData | null = null;

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  smileys: Smile,
  people: User,
  animals: Sparkles,
  food: Utensils,
  travel: Car,
  activities: Trophy,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
};

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelect,
  onClose,
  t: customT,
  className = "",
}) => {
  const t = customT ?? composerMessages();
  const [data, setData] = useState<EmojiData | null>(() => cachedEmojiData);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("smileys");
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Lazy load the emoji data
  useEffect(() => {
    if (cachedEmojiData) return;
    let mounted = true;
    import("../../lib/emojiData.json")
      .then((mod) => {
        const loaded = (mod.default ?? mod) as EmojiData;
        cachedEmojiData = loaded;
        if (mounted) setData(loaded);
      })
      .catch((err) => {
        console.error("Failed to load emoji data:", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Handle outside click & escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onClose]);

  // Filtered emojis for search
  const filteredEmojis = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data) return null;
    const results: Array<[emoji: string, name: string]> = [];
    for (const section of data.sections) {
      for (const [emoji, name, keywords] of section.emojis) {
        if (name.toLowerCase().includes(q) || keywords.toLowerCase().includes(q)) {
          results.push([emoji, name]);
          if (results.length >= 120) break;
        }
      }
      if (results.length >= 120) break;
    }
    return results;
  }, [data, search]);

  const scrollToCategory = (key: string) => {
    setActiveCategory(key);
    const target = sectionRefs.current.get(key);
    if (target && scrollRef.current) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const getCategoryTitle = (key: string): string => {
    const cats = t.categories as Record<string, string>;
    return cats[key] ?? key;
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={t.emoji}
      data-testid="wa-emoji-picker"
      className={`z-50 flex h-96 w-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-xl ${className}`}
    >
      {/* Search Header */}
      <div className="border-b border-slate-100 p-2.5">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-slate-400" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchEmoji}
            className="type-body w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-8 pl-9 text-slate-800 placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:outline-hidden"
            autoFocus
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 rounded-lg p-1 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Icons Tabs (hidden when searching) */}
      {!search && data && (
        <div className="flex border-b border-slate-100 px-2 py-1 overflow-x-auto no-scrollbar">
          {data.sections.map((section) => {
            const Icon = CATEGORY_ICONS[section.key] ?? Smile;
            const active = activeCategory === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => scrollToCategory(section.key)}
                title={getCategoryTitle(section.key)}
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  active
                    ? "bg-green-50 text-green-700"
                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                }`}
              >
                <Icon className="size-4" />
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Content Area */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {!data ? (
          <div className="flex h-full items-center justify-center py-12 text-slate-400">
            <Loader2 className="size-6 animate-spin text-green-600" aria-hidden />
          </div>
        ) : search ? (
          filteredEmojis && filteredEmojis.length > 0 ? (
            <div className="grid grid-cols-8 gap-1">
              {filteredEmojis.map(([emoji, name], i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  onClick={() => onSelect(emoji)}
                  title={name}
                  className="type-body flex size-8 items-center justify-center rounded-lg hover:bg-slate-100 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="type-meta text-slate-400">{t.noEmojiFound}</p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {data.sections.map((section) => (
              <div
                key={section.key}
                ref={(el) => {
                  if (el) sectionRefs.current.set(section.key, el);
                  else sectionRefs.current.delete(section.key);
                }}
              >
                <h4 className="type-overline sticky top-0 bg-white/95 py-1 text-slate-400 backdrop-blur-xs">
                  {getCategoryTitle(section.key)}
                </h4>
                <div className="grid grid-cols-8 gap-1">
                  {section.emojis.map(([emoji, name]) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onSelect(emoji)}
                      title={name}
                      className="type-body flex size-8 items-center justify-center rounded-lg hover:bg-slate-100 active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
