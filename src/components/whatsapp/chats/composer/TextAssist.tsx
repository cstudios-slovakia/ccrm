import React, { useState } from "react";
import {
  AlertCircle,
  Check,
  Globe,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import type { AssistLanguage, TextAssistResponse } from "../../api/contract.ts";
import type { WaaiClient } from "../../api/waaiClient.ts";
import { composerMessages, type ComposerMessages } from "./composerI18n.ts";

export type TextAssistAction = "fix" | "translate";

export interface TextAssistProps {
  client: WaaiClient;
  text: string;
  onApply: (newText: string) => void;
  onClose: () => void;
  t?: ComposerMessages;
  locale?: string;
}

export const TextAssist: React.FC<TextAssistProps> = ({
  client,
  text,
  onApply,
  onClose,
  t: customT,
  locale = "en",
}) => {
  const t = customT ?? composerMessages(locale);
  const [selectedAction, setSelectedAction] = useState<TextAssistAction>("fix");
  const [targetLang, setTargetLang] = useState<AssistLanguage>(
    locale.startsWith("sk") ? "sk" : locale.startsWith("hu") ? "hu" : "en",
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actions: Array<{
    id: TextAssistAction;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: "fix", label: t.improve, icon: Wand2 },
    { id: "translate", label: t.translate, icon: Globe },
  ];

  const handleRun = async (action: TextAssistAction, lang = targetLang) => {
    if (!text.trim() || loading) return;

    setSelectedAction(action);
    setLoading(true);
    setError(null);

    try {
      const res = await client.post<TextAssistResponse>("/chat/text-assist", {
        text: text.trim(),
        action,
        target_lang: action === "translate" ? lang : undefined,
        language: lang,
      });

      setResult(res.text);
    } catch (err) {
      console.error("AI text assist error:", err);
      setError(t.assistFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result) {
      onApply(result);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.textAssist}
      data-testid="wa-text-assist-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
    >
      <div className="flex w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <Sparkles className="size-4" />
            </span>
            <h3 className="type-card-title text-slate-800">{t.textAssist}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t.cancel}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Action pills */}
        <div className="my-3 flex flex-wrap gap-1.5">
          {actions.map((act) => {
            const Icon = act.icon;
            const active = selectedAction === act.id;
            return (
              <button
                key={act.id}
                type="button"
                onClick={() => handleRun(act.id)}
                disabled={loading}
                className={`type-meta inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors ${
                  active
                    ? "bg-green-600 text-white shadow-xs"
                    : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                } disabled:opacity-50`}
              >
                <Icon className="size-3.5" />
                <span>{act.label}</span>
              </button>
            );
          })}
        </div>

        {/* Target language selector (if translate selected) */}
        {selectedAction === "translate" && (
          <div className="mb-3 flex items-center gap-2">
            <span className="type-meta text-slate-500">{t.targetLang}:</span>
            <div className="flex gap-1">
              {(["en", "sk", "hu"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => {
                    setTargetLang(lang);
                    void handleRun("translate", lang);
                  }}
                  className={`type-label rounded-lg px-2.5 py-0.5 ${
                    targetLang === lang
                      ? "bg-green-100 text-green-800 font-semibold"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {lang === "en" ? t.english : lang === "sk" ? t.slovak : t.hungarian}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Original Draft Preview */}
        <div className="mb-3">
          <span className="type-overline block text-slate-400 mb-1">{t.originalText}</span>
          <div className="max-h-24 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2.5">
            <p className="type-body whitespace-pre-wrap text-slate-600">{text}</p>
          </div>
        </div>

        {/* Result Area */}
        <div className="mb-4">
          <span className="type-overline block text-slate-400 mb-1">{t.assistedText}</span>
          <div className="min-h-24 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
            {loading ? (
              <div className="flex h-24 items-center justify-center gap-2 text-slate-500">
                <Loader2 className="size-5 animate-spin text-green-600" aria-hidden />
                <span className="type-meta">{t.generating}</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span className="type-meta">{error}</span>
              </div>
            ) : result ? (
              <p className="type-body whitespace-pre-wrap text-slate-800">{result}</p>
            ) : (
              <div className="flex h-24 items-center justify-center text-slate-400">
                <p className="type-meta">Select an action above to generate text</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="type-label rounded-xl border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
          >
            {t.cancel}
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={!result || loading}
            className="type-label inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-1.5 text-white shadow-xs hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="size-4" />
            <span>{t.applyText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
