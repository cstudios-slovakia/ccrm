import { useEffect, useRef, useState } from "react";
import { Bold, Code, Eye, Italic, List, Square, X } from "lucide-react";
import { applyMarkdownFormat, renderBasicMarkdown } from "../../utils/basicMarkdown";
import type { TFn, TimeEntry } from "../../utils/timeTracking";

/**
 * Reusable basic-Markdown report editor with a compact formatting bar (bold, italic,
 * bullet list, inline code) and Write / Preview toggle. Used by StopReportDialog and EntryDrawer.
 */
export function MarkdownReportEditor({
  value,
  onChange,
  readOnly = false,
  rows = 4,
  placeholder,
  testId,
  t,
  onSubmitShortcut,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  rows?: number;
  placeholder?: string;
  testId?: string;
  t: TFn;
  onSubmitShortcut?: () => void;
  autoFocus?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const apply = (kind: "bold" | "italic" | "code" | "bullet") => {
    const el = areaRef.current;
    if (!el || readOnly) return;
    const res = applyMarkdownFormat(value, el.selectionStart ?? value.length, el.selectionEnd ?? value.length, kind);
    onChange(res.value);
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(res.selectionStart, res.selectionEnd);
    });
  };

  const toolBtn = "inline-flex size-7 items-center justify-center rounded text-gray-500 hover:bg-gray-200/70 hover:text-gray-900 cursor-pointer";
  const html = renderBasicMarkdown(value);

  return (
    <div className="grid overflow-hidden rounded-md border border-gray-200 bg-white focus-within:border-entity">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/80 px-2 py-1">
        <div className="flex items-center gap-0.5">
          {!readOnly && !preview && (
            <>
              <button type="button" onClick={() => apply("bold")} title={t("Bold (**text**)", "Tučné (**text**)", "Félkövér (**text**)")} className={toolBtn}><Bold className="size-3.5" /></button>
              <button type="button" onClick={() => apply("italic")} title={t("Italic (*text*)", "Kurzíva (*text*)", "Dőlt (*text*)")} className={toolBtn}><Italic className="size-3.5" /></button>
              <button type="button" onClick={() => apply("bullet")} title={t("Bullet list (- item)", "Odrážky (- položka)", "Felsorolás (- elem)")} className={toolBtn}><List className="size-3.5" /></button>
              <button type="button" onClick={() => apply("code")} title={t("Code (`code`)", "Kód (`kód`)", "Kód (`kód`)")} className={toolBtn}><Code className="size-3.5" /></button>
            </>
          )}
          {(readOnly || preview) && (
            <span className="px-1 text-micro font-semibold text-gray-500">{t("Markdown preview", "Náhľad Markdown", "Markdown előnézet")}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          data-testid={testId ? `${testId}-preview-toggle` : undefined}
          className={`inline-flex h-6 items-center gap-1 rounded px-2 text-micro font-semibold cursor-pointer ${preview ? "bg-entity-solid text-white" : "text-gray-600 hover:bg-gray-200/70"}`}
        >
          <Eye className="size-3" />
          {preview ? t("Edit", "Upraviť", "Szerk.") : t("Preview", "Náhľad", "Előnézet")}
        </button>
      </div>

      {preview ? (
        <div
          className="min-h-20 px-3 py-2 text-ui text-gray-800 [&_h3]:text-body [&_h3]:font-bold [&_h4]:text-ui [&_h4]:font-bold [&_h5]:text-ui [&_h5]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:font-mono [&_code]:text-micro"
          data-testid={testId ? `${testId}-preview` : undefined}
          dangerouslySetInnerHTML={{
            __html: html || `<p class="text-gray-400">${t("Nothing to preview yet.", "Zatiaľ žiadny obsah na náhľad.", "Még nincs mit megjeleníteni.")}</p>`,
          }}
        />
      ) : (
        <textarea
          ref={areaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (onSubmitShortcut && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onSubmitShortcut();
            }
          }}
          readOnly={readOnly}
          autoFocus={autoFocus}
          rows={rows}
          maxLength={1000}
          placeholder={placeholder}
          data-testid={testId}
          className="w-full resize-y border-0 bg-white px-3 py-2 text-ui text-gray-900 outline-none read-only:bg-gray-50"
        />
      )}
    </div>
  );
}

/** Small popover anchored under the Stop button asking "Type in what you did!" with basic Markdown. */
export function StopReportPopover({
  entry,
  onClose,
  onConfirm,
  t,
}: {
  entry: TimeEntry | null;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
  t: TFn;
}) {
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNote(entry?.note ?? "");
  }, [entry?.id, entry?.note]);

  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [entry, onClose]);

  if (!entry) return null;

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm(note);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={wrapRef}
      role="dialog"
      aria-label={t("Type in what you did!", "Napíšte, čo ste robili!", "Írja le, mit csinált!")}
      data-testid="stop-report-popover"
      className="absolute right-0 top-full z-[960] mt-2 w-80 sm:w-96 rounded-xl border border-gray-200 bg-white p-3.5 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-ui font-bold text-gray-900">
          {t("Type in what you did!", "Napíšte, čo ste robili!", "Írja le, mit csinált!")}
        </span>
        <button type="button" onClick={onClose} aria-label={t("Cancel", "Zrušiť", "Mégse")} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer">
          <X className="size-4" />
        </button>
      </div>

      <MarkdownReportEditor
        value={note}
        onChange={setNote}
        rows={3}
        autoFocus
        testId="stop-report-note"
        t={t}
        onSubmitShortcut={() => void submit()}
        placeholder={t("Supports **bold**, *italic*, `- bullets`, `code`… (optional)", "Podporuje **tučné**, *kurzívu*, `- odrážky`, `kód`… (voliteľné)", "Támogatja: **félkövér**, *dőlt*, `- felsorolás`, `kód`… (nem kötelező)")}
      />

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-micro text-gray-400">{t("Ctrl/⌘ + Enter", "Ctrl/⌘ + Enter", "Ctrl/⌘ + Enter")}</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onClose} className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-white px-2.5 text-micro font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
            {t("Cancel", "Zrušiť", "Mégse")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            data-testid="stop-report-submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-rose-600 px-3 text-micro font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
          >
            <Square className="size-3 fill-current" />
            {note.trim() ? t("Stop & save", "Zastaviť a uložiť", "Leállítás és mentés") : t("Stop", "Zastaviť", "Leállítás")}
          </button>
        </div>
      </div>
    </div>
  );
}
