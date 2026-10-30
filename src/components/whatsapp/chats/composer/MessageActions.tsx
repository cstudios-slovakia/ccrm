import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Edit3,
  Forward,
  MoreVertical,
  Reply,
  Trash2,
} from "lucide-react";
import type { DeleteMessageScope, MessageDto, OkResponse, QuotedMessage } from "../../api/contract.ts";
import type { WaaiClient } from "../../api/waaiClient.ts";
import { copyableText, isEditable, toQuote } from "./optimistic.ts";
import { ReactionBar } from "./ReactionBar";
import { ForwardDialog } from "./ForwardDialog";
import { composerMessages, type ComposerMessages } from "./composerI18n.ts";

export interface MessageActionsProps {
  client: WaaiClient;
  message: MessageDto;
  currentWaAccountId?: string;
  onReply?: (quoted: QuotedMessage) => void;
  onEdit?: (message: MessageDto) => void;
  onDelete?: (messageId: string, scope: DeleteMessageScope) => void;
  onReactionChange?: (messageId: string, emoji: string | null) => void;
  locale?: string;
  quickReactions?: string[];
  t?: ComposerMessages;
  trigger?: React.ReactNode;
  className?: string;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  client,
  message,
  currentWaAccountId,
  onReply,
  onEdit,
  onDelete,
  onReactionChange,
  locale,
  quickReactions,
  t: customT,
  trigger,
  className = "",
}) => {
  const t = customT ?? composerMessages(locale);
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showForwardDialog, setShowForwardDialog] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleCopy = async () => {
    const text = copyableText(message);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setIsOpen(false);
      }, 1000);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  };

  const handleReply = () => {
    onReply?.(toQuote(message));
    setIsOpen(false);
  };

  const handleEdit = () => {
    onEdit?.(message);
    setIsOpen(false);
  };

  const handleDeleteConfirm = async (scope: DeleteMessageScope) => {
    setIsDeleting(true);
    try {
      await client.del<OkResponse>(`/messages/${encodeURIComponent(message.id)}`, {
        query: { scope },
        body: { for_everyone: scope === "everyone" },
      });
      onDelete?.(message.id, scope);
      setShowDeleteModal(false);
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to delete message:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  const editable = isEditable(message);
  const isOwn = message.direction === "out";

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        aria-label={t.actions}
      >
        {trigger ?? <MoreVertical className="size-4" />}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          data-testid="wa-message-actions-menu"
          className="absolute right-0 top-full z-50 mt-1 w-52 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          {/* Reaction Bar on top */}
          <div className="border-b border-slate-100 pb-1.5 mb-1">
            <ReactionBar
              client={client}
              message={message}
              emojis={quickReactions}
              onReactionChange={onReactionChange}
              onClose={() => setIsOpen(false)}
              t={t}
            />
          </div>

          <div className="space-y-0.5">
            {/* Reply */}
            <button
              type="button"
              onClick={handleReply}
              className="type-body flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Reply className="size-4 text-slate-500" />
              <span>{t.reply}</span>
            </button>

            {/* Copy */}
            <button
              type="button"
              onClick={handleCopy}
              className="type-body flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="size-4 text-green-600" />
                  <span className="text-green-600 font-medium">{t.copied}</span>
                </>
              ) : (
                <>
                  <Copy className="size-4 text-slate-500" />
                  <span>{t.copy}</span>
                </>
              )}
            </button>

            {/* Edit (if editable) */}
            {editable && (
              <button
                type="button"
                onClick={handleEdit}
                className="type-body flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Edit3 className="size-4 text-slate-500" />
                <span>{t.edit}</span>
              </button>
            )}

            {/* Forward */}
            <button
              type="button"
              onClick={() => {
                setShowForwardDialog(true);
                setIsOpen(false);
              }}
              className="type-body flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Forward className="size-4 text-slate-500" />
              <span>{t.forward}</span>
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(true);
                setIsOpen(false);
              }}
              className="type-body flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="size-4 text-red-500" />
              <span>{t.delete}</span>
            </button>
          </div>
        </div>
      )}

      {/* Forward Dialog Modal */}
      {showForwardDialog && (
        <ForwardDialog
          client={client}
          message={message}
          currentWaAccountId={currentWaAccountId}
          onClose={() => setShowForwardDialog(false)}
          t={t}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="type-card-title text-slate-800 mb-2">{t.deleteTitle}</h3>
            <p className="type-body text-slate-600 mb-4">{t.deletePrompt}</p>

            <div className="flex flex-col gap-2">
              {isOwn && (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDeleteConfirm("everyone")}
                  className="type-label w-full rounded-xl bg-red-600 px-3 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {t.deleteForEveryone}
                </button>
              )}

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDeleteConfirm("me")}
                className="type-label w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {t.deleteForMe}
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="type-label mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 hover:bg-slate-50"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
