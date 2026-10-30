import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FolderKanban,
  Loader2,
  MessageCircle,
  Phone,
  PhoneOff,
  RotateCw,
  Send,
  User,
} from "lucide-react";
import type {
  OpenCheckResponse,
  OpenFailureCode,
  OpenStartResponse,
} from "../api/contract.ts";
import type { WaaiClient } from "../api/waaiClient.ts";
import { composerMessages, type ComposerMessages } from "../chats/composer/composerI18n.ts";

export interface OpenByPhoneProps {
  client: WaaiClient;
  phone: string;
  leadId?: string | null;
  projectId?: string | null;
  onOpenConversation: (conversationId: string) => void;
  onBack: () => void;
  locale?: string;
}

export const OpenByPhone: React.FC<OpenByPhoneProps> = ({
  client,
  phone,
  leadId,
  projectId,
  onOpenConversation,
  onBack,
  locale = "en",
}) => {
  const t: ComposerMessages = composerMessages(locale);
  const cleanPhone = phone.replace(/\D/g, "");

  const [checkStatus, setCheckStatus] = useState<
    "checking" | "registered" | "not_registered" | "error"
  >("checking");
  const [errorCode, setErrorCode] = useState<OpenFailureCode | null>(null);
  const [text, setText] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [successNoChat, setSuccessNoChat] = useState(false);

  const checkNumber = async () => {
    if (!cleanPhone) {
      setCheckStatus("error");
      setErrorCode("failed");
      return;
    }

    setCheckStatus("checking");
    setErrorCode(null);
    setStartError(null);

    try {
      const res = await client.post<OpenCheckResponse>("/open/check", {
        phone: cleanPhone,
      });

      if (res.status === "registered") {
        setCheckStatus("registered");
      } else if (res.status === "not_registered") {
        setCheckStatus("not_registered");
      } else {
        setCheckStatus("error");
        setErrorCode(res.code);
      }
    } catch (err) {
      console.error("Failed to check phone registration:", err);
      setCheckStatus("error");
      setErrorCode("failed");
    }
  };

  useEffect(() => {
    void checkNumber();
  }, [cleanPhone]);

  const handleStartChat = async () => {
    const trimmed = text.trim();
    if (!trimmed || isStarting) return;

    setIsStarting(true);
    setStartError(null);

    try {
      const res = await client.post<OpenStartResponse>("/open/start", {
        phone: cleanPhone,
        text: trimmed,
        lead_id: leadId ?? null,
        project_id: projectId ?? null,
      });

      if (res.ok) {
        if (res.conversation_id) {
          onOpenConversation(res.conversation_id);
        } else {
          setSuccessNoChat(true);
        }
      } else {
        setStartError(
          res.code === "offline"
            ? t.openErrorOffline
            : res.code === "not_registered"
              ? t.notRegisteredBody(phone)
              : res.code === "limit"
                ? t.openErrorLimit
                : t.openErrorGeneric,
        );
      }
    } catch (err) {
      console.error("Failed to start chat:", err);
      setStartError(t.openErrorGeneric);
    } finally {
      setIsStarting(false);
    }
  };

  // 1. Loading check state
  if (checkStatus === "checking") {
    return (
      <div
        data-testid="wa-open-checking"
        className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
      >
        <Loader2 className="size-8 animate-spin text-green-600" aria-hidden />
        <p className="type-body text-slate-600">{t.checkingPhone}</p>
        <p className="type-meta font-mono text-slate-400">+{cleanPhone}</p>
      </div>
    );
  }

  // 2. Not registered state
  if (checkStatus === "not_registered") {
    return (
      <div
        data-testid="wa-open-not-registered"
        className="flex h-full flex-col items-center justify-center p-8 text-center"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-4">
          <PhoneOff className="size-7" aria-hidden />
        </div>
        <h3 className="type-panel-title text-slate-800 mb-2">{t.notRegisteredTitle}</h3>
        <p className="type-body max-w-md text-slate-600 mb-6">
          {t.notRegisteredBody(`+${cleanPhone}`)}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="type-label inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" />
          <span>{t.back}</span>
        </button>
      </div>
    );
  }

  // 3. Error state
  if (checkStatus === "error") {
    const errorText =
      errorCode === "offline"
        ? t.openErrorOffline
        : errorCode === "limit"
          ? t.openErrorLimit
          : t.openErrorGeneric;

    return (
      <div
        data-testid="wa-open-error"
        className="flex h-full flex-col items-center justify-center p-8 text-center"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 mb-4">
          <AlertCircle className="size-7" aria-hidden />
        </div>
        <h3 className="type-panel-title text-slate-800 mb-2">{t.openErrorTitle}</h3>
        <p className="type-body max-w-md text-slate-600 mb-6">{errorText}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="type-label rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            {t.back}
          </button>
          <button
            type="button"
            onClick={() => void checkNumber()}
            className="type-label inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            <RotateCw className="size-4" />
            <span>{t.retry}</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Success message sent (conversation will appear soon)
  if (successNoChat) {
    return (
      <div
        data-testid="wa-open-sent"
        className="flex h-full flex-col items-center justify-center p-8 text-center"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-green-50 text-green-600 mb-4">
          <CheckCircle2 className="size-7" aria-hidden />
        </div>
        <h3 className="type-panel-title text-slate-800 mb-2">{t.startChatTitle}</h3>
        <p className="type-body max-w-md text-slate-600 mb-6">{t.openSuccessNoChat}</p>
        <button
          type="button"
          onClick={onBack}
          className="type-label rounded-xl bg-green-600 px-4 py-2 text-white hover:bg-green-700"
        >
          {t.back}
        </button>
      </div>
    );
  }

  // 5. Registered: First-message composer
  return (
    <div
      data-testid="wa-open-registered"
      className="flex h-full flex-col bg-white"
    >
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.back}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
          <Phone className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="type-card-title truncate text-slate-800">+{cleanPhone}</h2>
          <div className="flex items-center gap-2">
            <span className="type-meta inline-flex items-center gap-1 text-green-600">
              <MessageCircle className="size-3" />
              WhatsApp
            </span>
            {leadId && (
              <span className="type-meta inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                <User className="size-3" />
                Lead
              </span>
            )}
            {projectId && (
              <span className="type-meta inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                <FolderKanban className="size-3" />
                Project
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main body */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="type-card-title text-slate-800 mb-1">{t.startChatTitle}</h3>
          <p className="type-meta text-slate-500 mb-4">
            Send an initial message to start chatting with +{cleanPhone}.
          </p>

          {startError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-700">
              <AlertCircle className="size-4 shrink-0 text-red-500" aria-hidden />
              <p className="type-meta">{startError}</p>
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.firstMessagePlaceholder}
            rows={4}
            className="type-body w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800 placeholder:text-slate-400 focus:border-green-500 focus:bg-white focus:outline-hidden mb-4"
            autoFocus
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="type-label rounded-xl border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              {t.back}
            </button>
            <button
              type="button"
              onClick={() => void handleStartChat()}
              disabled={!text.trim() || isStarting}
              className="type-label inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-white shadow-xs hover:bg-green-700 disabled:opacity-50"
            >
              {isStarting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>{t.startingChat}</span>
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  <span>{t.startChatButton}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
