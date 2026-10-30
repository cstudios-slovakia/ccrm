import React, { useState } from "react";
import { Plus } from "lucide-react";
import type { MessageDto, ReactionResponse } from "../../api/contract.ts";
import type { WaaiClient } from "../../api/waaiClient.ts";
import { nextReaction, ownReaction } from "./optimistic.ts";
import { EmojiPicker } from "./EmojiPicker";
import { composerMessages, type ComposerMessages } from "./composerI18n.ts";

export interface ReactionBarProps {
  client: WaaiClient;
  message: MessageDto;
  emojis?: string[];
  onReactionChange?: (messageId: string, emoji: string | null) => void;
  onClose?: () => void;
  t?: ComposerMessages;
  className?: string;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export const ReactionBar: React.FC<ReactionBarProps> = ({
  client,
  message,
  emojis,
  onReactionChange,
  onClose,
  t: customT,
  className = "",
}) => {
  const t = customT ?? composerMessages();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const currentMine = ownReaction(message.reactions);
  const quickList = emojis && emojis.length > 0 ? emojis : QUICK_EMOJIS;

  const handleSelectEmoji = async (emoji: string) => {
    const next = nextReaction(message.reactions, emoji);
    setShowEmojiPicker(false);

    // Optimistically update
    onReactionChange?.(message.id, next);
    onClose?.();

    try {
      await client.post<ReactionResponse>(
        `/messages/${encodeURIComponent(message.id)}/reaction`,
        { emoji: next },
      );
    } catch (err) {
      // Revert on failure
      onReactionChange?.(message.id, currentMine);
      console.error("Failed to react to message:", err);
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        data-testid="wa-reaction-bar"
        className="flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-lg"
      >
        {quickList.map((emoji) => {
          const isSelected = currentMine === emoji;
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => handleSelectEmoji(emoji)}
              title={isSelected ? t.removeReaction : t.addReaction}
              className={`flex size-8 items-center justify-center type-body rounded-full transition-transform hover:scale-125 active:scale-100 ${
                isSelected ? "bg-green-100 scale-110" : "hover:bg-slate-100"
              }`}
            >
              {emoji}
            </button>
          );
        })}

        <div className="mx-0.5 h-4 w-px bg-slate-200" />

        <button
          type="button"
          onClick={() => setShowEmojiPicker((prev) => !prev)}
          title={t.emoji}
          aria-label={t.emoji}
          className="flex size-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {showEmojiPicker && (
        <div className="absolute top-full left-0 z-50 mt-2">
          <EmojiPicker
            onSelect={handleSelectEmoji}
            onClose={() => setShowEmojiPicker(false)}
            t={t}
          />
        </div>
      )}
    </div>
  );
};
