import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, Search, Send, X } from "lucide-react";
import type { ForwardTargetsResponse, ForwardTarget, MessageDto } from "../../api/contract.ts";
import type { WaaiClient } from "../../api/waaiClient.ts";
import { Avatar } from "../Avatar";
import { copyableText } from "./optimistic.ts";
import { composerMessages, type ComposerMessages } from "./composerI18n.ts";

export interface ForwardDialogProps {
  client: WaaiClient;
  message: MessageDto;
  currentWaAccountId?: string;
  onClose: () => void;
  onForwarded?: (targetConversationId: string) => void;
  t?: ComposerMessages;
}

export const ForwardDialog: React.FC<ForwardDialogProps> = ({
  client,
  message,
  currentWaAccountId,
  onClose,
  onForwarded,
  t: customT,
}) => {
  const t = customT ?? composerMessages();
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<ForwardTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(null);

    client
      .get<ForwardTargetsResponse>("/conversations/lite", { signal: abort.signal })
      .then((res) => {
        if (!abort.signal.aborted) {
          setConversations(res.conversations || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!abort.signal.aborted) {
          console.error("Failed to load forward targets:", err);
          setError(t.forwardFailed);
          setLoading(false);
        }
      });

    return () => abort.abort();
  }, [client, t]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const handleForward = async (target: ForwardTarget) => {
    if (sendingId) return;
    setSendingId(target.id);
    setError(null);

    try {
      await client.post(`/messages/${encodeURIComponent(message.id)}/forward`, {
        target_conversation_id: target.id,
      });
      setSuccessId(target.id);
      setTimeout(() => {
        onForwarded?.(target.id);
        onClose();
      }, 500);
    } catch (err) {
      console.error("Failed to forward message:", err);
      setError(t.forwardFailed);
      setSendingId(null);
    }
  };

  const preview = copyableText(message) || (message.kind !== "text" ? `[${message.kind}]` : "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.forwardTitle}
      data-testid="wa-forward-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
    >
      <div className="flex w-full max-w-md flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3">
          <h3 className="type-card-title text-slate-800">{t.forwardTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t.cancel}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Message preview snippet */}
        {preview && (
          <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
            <p className="type-meta line-clamp-2 text-slate-600 italic">"{preview}"</p>
          </div>
        )}

        {/* Search input */}
        <div className="relative mb-3 flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-slate-400" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.forwardSearch}
            className="type-body w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-8 pl-9 text-slate-800 placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:outline-hidden"
            autoFocus
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 rounded-lg p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700">
            <AlertCircle className="size-4 shrink-0 text-red-500" aria-hidden />
            <p className="type-meta">{error}</p>
          </div>
        )}

        {/* Target list */}
        <div className="min-h-48 max-h-72 overflow-y-auto space-y-1 pr-1">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-green-600" aria-hidden />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-center">
              <p className="type-meta text-slate-400">{t.noConversations}</p>
            </div>
          ) : (
            filteredConversations.map((target) => {
              const isDifferentAccount =
                Boolean(currentWaAccountId) && target.wa_account_id !== currentWaAccountId;
              const isSending = sendingId === target.id;
              const isSuccess = successId === target.id;

              return (
                <div
                  key={target.id}
                  className={`flex items-center justify-between gap-3 rounded-xl p-2 transition-colors ${
                    isDifferentAccount
                      ? "opacity-50 bg-slate-50 cursor-not-allowed"
                      : "hover:bg-slate-50 cursor-pointer"
                  }`}
                  onClick={() => {
                    if (!isDifferentAccount && !isSending && !isSuccess) {
                      void handleForward(target);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      client={client}
                      src={target.avatar_url}
                      name={target.title}
                      group={target.is_group}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="type-label truncate text-slate-800">{target.title}</p>
                      {isDifferentAccount && (
                        <p className="type-overline text-amber-600">
                          {t.crossAccountDisabled}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    {isSuccess ? (
                      <span className="flex size-8 items-center justify-center rounded-full bg-green-100 text-green-700">
                        <Check className="size-4" />
                      </span>
                    ) : isSending ? (
                      <span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                        <Loader2 className="size-4 animate-spin" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isDifferentAccount}
                        className={`flex size-8 items-center justify-center rounded-full transition-colors ${
                          isDifferentAccount
                            ? "text-slate-300"
                            : "text-slate-500 hover:bg-green-50 hover:text-green-600"
                        }`}
                        title={t.forward}
                      >
                        <Send className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="type-label rounded-xl border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
};
