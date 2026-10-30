import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CornerDownLeft,
  FileText,
  Mic,
  Paperclip,
  Pencil,
  Reply,
  Send,
  Smile,
  Sparkles,
  X,
} from "lucide-react";
import { MAX_SEND_FILE_BYTES, type EditMessageResponse, type MessageDto, type QuotedMessage, type SendMessageResponse } from "../../api/contract.ts";
import type { WaaiClient } from "../../api/waaiClient.ts";
import { cleanPastedFile, formatBytes, withinSizeLimit } from "./attachments.ts";
import { buildLocalMessage, LOCAL_PREFIX } from "./optimistic.ts";
import { uploadWithProgress } from "./uploadXhr.ts";
import { EmojiPicker } from "./EmojiPicker";
import { VoiceNoteRecorder } from "./VoiceNoteRecorder";
import { TextAssist } from "./TextAssist";
import { composerMessages, type ComposerMessages } from "./composerI18n.ts";

export interface ComposerProps {
  client: WaaiClient;
  conversationId: string;
  quoted?: QuotedMessage | null;
  onClearQuote?: () => void;
  editingMessage?: MessageDto | null;
  onClearEdit?: () => void;
  onOptimisticMessage?: (localMsg: MessageDto) => void;
  onOptimisticSettle?: (localId: string, stored: MessageDto) => void;
  onOptimisticError?: (localId: string, error: string) => void;
  onMessageEdited?: (edited: MessageDto) => void;
  t?: ComposerMessages;
  locale?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  client,
  conversationId,
  quoted,
  onClearQuote,
  editingMessage,
  onClearEdit,
  onOptimisticMessage,
  onOptimisticSettle,
  onOptimisticError,
  onMessageEdited,
  t: customT,
  locale = "en",
}) => {
  const t = customT ?? composerMessages(locale);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTextAssist, setShowTextAssist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync editing message
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.body || "");
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [editingMessage]);

  // Adjust textarea height on text change
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${Math.max(nextHeight, 38)}px`;
  }, [text]);

  const handleAttachFile = (file: File) => {
    if (!withinSizeLimit(file)) {
      setError(t.fileTooLarge(formatBytes(MAX_SEND_FILE_BYTES)));
      return;
    }
    setError(null);
    setAttachment(file);
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAttachFile(file);
  };

  const handleRemoveAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAttachment(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      if (file && file.type.startsWith("image/")) {
        e.preventDefault();
        const cleaned = cleanPastedFile(file);
        handleAttachFile(cleaned);
      }
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const updated = text.slice(0, start) + emoji + text.slice(end);
    setText(updated);
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + emoji.length;
      el.focus();
    }, 0);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !attachment) return;
    if (isSending) return;

    setError(null);

    // Editing mode
    if (editingMessage) {
      setIsSending(true);
      try {
        const res = await client.patch<EditMessageResponse>(
          `/messages/${encodeURIComponent(editingMessage.id)}`,
          { body: trimmed },
        );
        onMessageEdited?.({
          ...editingMessage,
          body: res.body,
          edited_at: res.edited_at,
          translation_note: res.translation_note,
        });
        onClearEdit?.();
        setText("");
      } catch (err) {
        console.error("Failed to edit message:", err);
        setError(t.editFailed);
      } finally {
        setIsSending(false);
      }
      return;
    }

    // New message: Optimistic build
    const localId = `${LOCAL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localMsg = buildLocalMessage({
      id: localId,
      conversationId,
      text: trimmed,
      file: attachment ? { name: attachment.name, type: attachment.type } : null,
      asVoice: false,
      quoted: quoted ?? null,
      draftText: null,
      previewUrl,
      now: new Date(),
    });

    onOptimisticMessage?.(localMsg);

    // Clear composer immediately
    const sentAttachment = attachment;
    setText("");
    setAttachment(null);
    setPreviewUrl(null);
    onClearQuote?.();
    if (fileInputRef.current) fileInputRef.current.value = "";

    setIsSending(true);

    try {
      if (sentAttachment) {
        // Multipart upload with progress
        const session = await client.open();
        const formData = new FormData();
        formData.append("file", sentAttachment);
        if (trimmed) formData.append("text", trimmed);
        if (quoted) formData.append("quoted_message_id", quoted.id);

        const url = `${client.base}/conversations/${encodeURIComponent(conversationId)}/send`;
        const res = await uploadWithProgress<SendMessageResponse>({
          url,
          token: session.access_token,
          body: formData,
          onProgress: (fraction) => setUploadProgress(fraction),
        });

        onOptimisticSettle?.(localId, res.message);
      } else {
        // JSON send
        const res = await client.post<SendMessageResponse>(
          `/conversations/${encodeURIComponent(conversationId)}/send`,
          {
            text: trimmed,
            quoted_message_id: quoted?.id,
          },
        );

        onOptimisticSettle?.(localId, res.message);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      const msg = err instanceof Error ? err.message : t.uploadFailed;
      onOptimisticError?.(localId, msg);
      setError(msg);
    } finally {
      setIsSending(false);
      setUploadProgress(null);
    }
  };

  const handleVoiceSend = async (blob: Blob, _duration: number, ext: "ogg" | "m4a" | "webm") => {
    setIsRecordingVoice(false);
    setError(null);

    const voiceFile = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type });
    const localId = `${LOCAL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const localMsg = buildLocalMessage({
      id: localId,
      conversationId,
      text: "",
      file: { name: voiceFile.name, type: voiceFile.type },
      asVoice: true,
      quoted: quoted ?? null,
      draftText: null,
      previewUrl: URL.createObjectURL(blob),
      now: new Date(),
    });

    onOptimisticMessage?.(localMsg);
    onClearQuote?.();

    try {
      const session = await client.open();
      const formData = new FormData();
      formData.append("file", voiceFile);
      formData.append("as_voice", "1");
      if (quoted) formData.append("quoted_message_id", quoted.id);

      const url = `${client.base}/conversations/${encodeURIComponent(conversationId)}/send`;
      const res = await uploadWithProgress<SendMessageResponse>({
        url,
        token: session.access_token,
        body: formData,
      });

      onOptimisticSettle?.(localId, res.message);
    } catch (err) {
      console.error("Failed to send voice note:", err);
      const msg = err instanceof Error ? err.message : t.uploadFailed;
      onOptimisticError?.(localId, msg);
      setError(msg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const canSend = Boolean(text.trim() || attachment);

  return (
    <footer className="relative flex flex-col border-t border-slate-100 bg-white p-3">
      {/* Reply Banner */}
      {quoted && (
        <div
          data-testid="wa-reply-preview"
          className="mb-2 flex items-center justify-between rounded-xl border-l-4 border-green-600 bg-slate-50 px-3 py-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="size-4 shrink-0 text-green-600" aria-hidden />
            <div className="min-w-0">
              <span className="type-label block text-green-700">
                {t.replyingTo} {quoted.sender ?? t.send}
              </span>
              <span className="type-meta line-clamp-1 text-slate-600">
                {quoted.body ?? quoted.transcription ?? ""}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClearQuote}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            title={t.cancelReply}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Edit Banner */}
      {editingMessage && (
        <div
          data-testid="wa-edit-preview"
          className="mb-2 flex items-center justify-between rounded-xl border-l-4 border-amber-500 bg-amber-50 px-3 py-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Pencil className="size-4 shrink-0 text-amber-600" aria-hidden />
            <div className="min-w-0">
              <span className="type-label block text-amber-800">{t.editingMessage}</span>
              <span className="type-meta line-clamp-1 text-amber-700">
                {editingMessage.body}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setText("");
              onClearEdit?.();
            }}
            className="rounded-lg p-1 text-amber-600 hover:bg-amber-100"
            title={t.cancelEdit}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Attachment Preview Chip */}
      {attachment && (
        <div
          data-testid="wa-attachment-preview"
          className="mb-2 inline-flex max-w-sm items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-xs"
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="size-10 rounded-lg object-cover"
            />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
              <FileText className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="type-label truncate text-slate-800">{attachment.name}</p>
            <p className="type-meta text-slate-400">{formatBytes(attachment.size)}</p>
          </div>
          <button
            type="button"
            onClick={handleRemoveAttachment}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            title={t.removeAttachment}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Error alert banner */}
      {error && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2 text-red-700">
          <AlertCircle className="size-4 shrink-0 text-red-500" aria-hidden />
          <p className="type-meta flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded-lg p-1 text-red-500 hover:bg-red-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Main Composer Row / Voice Note Recorder */}
      {isRecordingVoice ? (
        <VoiceNoteRecorder
          onSend={handleVoiceSend}
          onCancel={() => setIsRecordingVoice(false)}
          t={t}
        />
      ) : (
        <div className="flex items-end gap-1.5">
          {/* Action Tools Left */}
          <div className="flex items-center gap-0.5 pb-1">
            {/* Emoji Picker toggle button */}
            <button
              type="button"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              title={t.emoji}
              aria-label={t.emoji}
              className={`flex size-9 items-center justify-center rounded-xl transition-colors ${
                showEmojiPicker
                  ? "bg-green-50 text-green-700"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              }`}
            >
              <Smile className="size-5" />
            </button>

            {/* Attach File button */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={t.attachFile}
              aria-label={t.attachFile}
              className="flex size-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <Paperclip className="size-5" />
            </button>

            {/* AI Text Assist button (if draft exists) */}
            {text.trim() && (
              <button
                type="button"
                onClick={() => setShowTextAssist(true)}
                title={t.textAssist}
                aria-label={t.textAssist}
                className="flex size-9 items-center justify-center rounded-xl text-amber-500 hover:bg-amber-50 hover:text-amber-600 transition-colors"
              >
                <Sparkles className="size-5" />
              </button>
            )}
          </div>

          {/* Text Input Area */}
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={t.placeholder}
              rows={1}
              className="type-body w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-slate-800 placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:outline-hidden"
            />
            {uploadProgress !== null && (
              <div className="absolute bottom-0 left-0 right-0 h-1 overflow-hidden rounded-b-2xl bg-slate-200">
                <div
                  className="h-full bg-green-500 transition-all duration-150"
                  style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Action Tools Right: Voice Note or Send */}
          <div className="pb-1">
            {canSend || editingMessage ? (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isSending || !canSend}
                title={editingMessage ? t.saveEdit : t.send}
                aria-label={editingMessage ? t.saveEdit : t.send}
                className="flex size-9 items-center justify-center rounded-xl bg-green-600 text-white shadow-xs transition-colors hover:bg-green-700 active:scale-95 disabled:opacity-50"
              >
                {editingMessage ? (
                  <CornerDownLeft className="size-4" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsRecordingVoice(true)}
                title={t.recordVoice}
                aria-label={t.recordVoice}
                className="flex size-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:scale-95"
              >
                <Mic className="size-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-full left-3 z-50 mb-2">
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
            t={t}
          />
        </div>
      )}

      {/* AI Text Assist Modal */}
      {showTextAssist && (
        <TextAssist
          client={client}
          text={text}
          onApply={(assisted) => setText(assisted)}
          onClose={() => setShowTextAssist(false)}
          t={t}
          locale={locale}
        />
      )}
    </footer>
  );
};
