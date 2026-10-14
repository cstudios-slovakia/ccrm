import React, { useRef, useState, useEffect } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Paperclip,
  RemoveFormatting,
  X,
  FileText,
  ExternalLink,
  Heading2,
  Loader2,
} from "lucide-react";
import type { TicketAttachment } from "../../types";
import type { Language } from "../../utils/translations";

export const isImageAttachment = (att: TicketAttachment): boolean => {
  const src = (att.path || att.url || att.dataUrl || att.name || "").toLowerCase();
  if (src.startsWith("data:image/")) return true;
  if (att.type && att.type.toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(src);
};

export const sanitizeTicketHtml = (raw: string): string => {
  if (!raw) return "";
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
};

export const looksLikeHtml = (text: string): boolean => {
  if (!text) return false;
  return /<\/?(?:p|div|br|strong|b|em|i|u|s|ul|ol|li|h[1-6]|pre|code|blockquote|a|img|span)\b[^>]*>/i.test(
    text,
  );
};

export const plainTextToHtml = (text: string): string => {
  if (!text) return "";
  if (looksLikeHtml(text)) return sanitizeTicketHtml(text);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
};

export const isRichTextEmpty = (html: string): boolean => {
  if (!html) return true;
  if (/<img\b/i.test(html)) return false;
  const stripped = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return stripped.length === 0;
};

export async function uploadTicketFile(
  file: File,
  prefix = "tkt",
): Promise<TicketAttachment> {
  const eventId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const sizeStr =
    file.size > 1024 * 1024
      ? (file.size / (1024 * 1024)).toFixed(1) + " MB"
      : Math.max(1, Math.round(file.size / 1024)) + " KB";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("eventId", eventId);

  try {
    const res = await fetch("/upload.php", { method: "POST", body: formData });
    const data = await res.json();
    if (data && data.success) {
      const path =
        data.filePath || `/uploads/${eventId}_${data.fileName || file.name}`;
      return {
        id: eventId,
        name: data.fileName || file.name,
        type: file.type || undefined,
        size: sizeStr,
        path,
        url: path,
      };
    }
  } catch {
    // Fallback to Data URL if upload endpoint is unavailable in test/offline mode
  }

  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });

  return {
    id: eventId,
    name: file.name,
    type: file.type || undefined,
    size: sizeStr,
    path: dataUrl || `/uploads/${eventId}_${file.name}`,
    url: dataUrl || `/uploads/${eventId}_${file.name}`,
    dataUrl: dataUrl || undefined,
  };
}

interface TicketRichHtmlEditorProps {
  value: string;
  onChange: (html: string) => void;
  attachments: TicketAttachment[];
  onAttachmentsChange: React.Dispatch<React.SetStateAction<TicketAttachment[]>>;
  placeholder?: string;
  userLanguage?: Language;
  tone?: "default" | "internal";
  minRows?: number;
  disabled?: boolean;
}

export const TicketRichHtmlEditor: React.FC<TicketRichHtmlEditorProps> = ({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  placeholder,
  userLanguage = "en",
  tone = "default",
  minRows = 3,
  disabled = false,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const lastEmittedRef = useRef<string>(value);

  // Sync external value changes (e.g. reset after submit or template insertion)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastEmittedRef.current) {
      const nextHtml = plainTextToHtml(value);
      if (el.innerHTML !== nextHtml) {
        el.innerHTML = nextHtml;
      }
      lastEmittedRef.current = value;
    }
  }, [value]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    const raw = sanitizeTicketHtml(el.innerHTML);
    const normalized = isRichTextEmpty(raw) ? "" : raw;
    lastEmittedRef.current = normalized;
    onChange(normalized);
  };

  const execFormat = (command: string, arg?: string) => {
    if (disabled) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, arg);
    emitChange();
  };

  const handleInsertLink = () => {
    if (disabled) return;
    const url = window.prompt(
      t("Enter link URL:", "Zadajte URL odkazu:", "Adja meg a hivatkozás URL-jét:"),
      "https://",
    );
    if (url && url.trim() && url.trim() !== "https://") {
      execFormat("createLink", url.trim());
    }
  };

  const handleFilesSelected = async (
    files: FileList | File[],
    insertInlineIfImage = false,
  ) => {
    const list = Array.from(files);
    if (list.length === 0 || disabled) return;
    setIsUploading(true);
    try {
      const uploaded: TicketAttachment[] = [];
      for (const file of list) {
        const att = await uploadTicketFile(file);
        uploaded.push(att);
        if (insertInlineIfImage && isImageAttachment(att) && editorRef.current) {
          const src = att.path || att.url || att.dataUrl;
          if (src) {
            editorRef.current.focus();
            document.execCommand(
              "insertHTML",
              false,
              `<img src="${src}" alt="${att.name.replace(/"/g, "")}" class="max-h-48 rounded-xl border border-slate-200 my-1.5" />`,
            );
            emitChange();
          }
        }
      }
      onAttachmentsChange((prev) => [...prev, ...uploaded]);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      void handleFilesSelected(imageFiles, true);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      void handleFilesSelected(e.dataTransfer.files, false);
    }
  };

  const minHeightClass =
    minRows >= 5 ? "min-h-36" : minRows >= 4 ? "min-h-28" : "min-h-22";

  return (
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
      className={`rounded-2xl border transition-all overflow-hidden ${
        isDraggingOver
          ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/20"
          : tone === "internal"
            ? "bg-amber-50/60 border-amber-300 focus-within:border-amber-500"
            : "bg-white border-slate-200 focus-within:border-indigo-500"
      }`}
    >
      {/* Rich HTML Formatting & Attachment Toolbar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5 border-b ${
          tone === "internal"
            ? "border-amber-200/80 bg-amber-100/50"
            : "border-slate-100 bg-slate-50/80"
        }`}
      >
        <div className="flex flex-wrap items-center gap-0.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => execFormat("bold")}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Bold (Ctrl+B)", "Tučné (Ctrl+B)", "Félkövér (Ctrl+B)")}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => execFormat("italic")}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Italic (Ctrl+I)", "Kurzíva (Ctrl+I)", "Dőlt (Ctrl+I)")}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => execFormat("underline")}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Underline (Ctrl+U)", "Podčiarknuté (Ctrl+U)", "Aláhúzott (Ctrl+U)")}
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => execFormat("strikeThrough")}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Strikethrough", "Prečiarknuté", "Áthúzott")}
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-200 mx-1" />

          <button
            type="button"
            disabled={disabled}
            onClick={() => execFormat("formatBlock", "H3")}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Heading", "Nadpis", "Címsor")}
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => execFormat("insertUnorderedList")}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Bullet List", "Odrážkový zoznam", "Felsorolás")}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => execFormat("insertOrderedList")}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Numbered List", "Číslovaný zoznam", "Számozott lista")}
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => execFormat("formatBlock", "PRE")}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Code Block", "Blok kódu", "Kódblokk")}
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={handleInsertLink}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Insert Link", "Vložiť odkaz", "Hivatkozás beszúrása")}
          >
            <LinkIcon className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => execFormat("removeFormat")}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Clear Formatting", "Odstrániť formátovanie", "Formázás törlése")}
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Image & File Upload Buttons */}
        <div className="flex items-center gap-1.5">
          {isUploading && (
            <span className="inline-flex items-center gap-1 text-micro font-bold text-indigo-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t("Uploading...", "Nahráva sa...", "Feltöltés...")}</span>
            </span>
          )}
          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={() => imageInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-micro font-bold text-slate-700 hover:text-indigo-700 transition-colors cursor-pointer disabled:opacity-40"
            title={t(
              "Upload or insert images (or paste from clipboard)",
              "Nahrať alebo vložiť obrázky (alebo prilepiť zo schránky)",
              "Képek feltöltése vagy beszúrása (vagy vágólapról)",
            )}
          >
            <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
            <span>{t("Image", "Obrázok", "Kép")}</span>
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleFilesSelected(e.target.files, false);
                e.target.value = "";
              }
            }}
          />

          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-micro font-bold text-slate-700 transition-colors cursor-pointer disabled:opacity-40"
            title={t("Attach files or documents", "Priložiť súbory alebo dokumenty", "Fájlok vagy dokumentumok csatolása")}
          >
            <Paperclip className="w-3.5 h-3.5 text-slate-500" />
            <span>{t("File", "Súbor", "Fájl")}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleFilesSelected(e.target.files, false);
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>

      {/* ContentEditable Surface */}
      <div className="relative">
        {isRichTextEmpty(value) && placeholder && (
          <div className="pointer-events-none select-none absolute top-2.5 left-3 right-3 text-caption text-slate-400">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          onPaste={handlePaste}
          className={`w-full px-3 py-2.5 ${minHeightClass} max-h-60 overflow-y-auto text-caption text-slate-800 focus:outline-none leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:font-heading [&_h3]:font-bold [&_h3]:text-ui [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:font-mono [&_pre]:text-micro [&_a]:text-indigo-600 [&_a]:underline`}
        />
      </div>

      {/* Attached Images & Files Preview Bar */}
      {attachments.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/70 flex flex-wrap gap-2">
          {attachments.map((att, idx) => {
            const isImg = isImageAttachment(att);
            const src = att.path || att.url || att.dataUrl || "";
            return isImg && src ? (
              <div
                key={att.id || `${att.name}-${idx}`}
                className="group relative flex items-center gap-2 p-1.5 pr-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs"
              >
                <img
                  src={src}
                  alt={att.name}
                  className="h-10 w-10 rounded-lg object-cover border border-slate-100 shrink-0"
                />
                <div className="min-w-0 max-w-36">
                  <div className="text-micro font-bold text-slate-700 truncate">
                    {att.name}
                  </div>
                  {att.size && (
                    <div className="text-micro text-slate-400">{att.size}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onAttachmentsChange((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  title={t("Remove", "Odstrániť", "Eltávolítás")}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div
                key={att.id || `${att.name}-${idx}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-micro font-bold text-slate-700 shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate max-w-44">{att.name}</span>
                {att.size && <span className="text-slate-400">({att.size})</span>}
                <button
                  type="button"
                  onClick={() =>
                    onAttachmentsChange((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-slate-400 hover:text-rose-600 cursor-pointer ml-0.5"
                  title={t("Remove", "Odstrániť", "Eltávolítás")}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const TicketHtmlContent: React.FC<{
  content?: string | null;
  className?: string;
}> = ({ content, className = "" }) => {
  if (!content) return null;
  if (looksLikeHtml(content)) {
    return (
      <div
        className={`text-caption leading-relaxed break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:font-heading [&_h3]:font-bold [&_h3]:text-ui [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-2.5 [&_pre]:rounded-xl [&_pre]:font-mono [&_pre]:text-micro [&_pre]:overflow-x-auto [&_a]:text-indigo-600 [&_a]:underline [&_img]:max-h-56 [&_img]:rounded-xl [&_img]:border [&_img]:border-slate-200 [&_img]:my-1.5 ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeTicketHtml(content) }}
      />
    );
  }
  return (
    <div className={`text-caption whitespace-pre-wrap leading-relaxed break-words ${className}`}>
      {content}
    </div>
  );
};

export const TicketAttachmentsList: React.FC<{
  attachments?: TicketAttachment[] | null;
}> = ({ attachments }) => {
  if (!attachments || attachments.length === 0) return null;
  const images = attachments.filter(isImageAttachment);
  const files = attachments.filter((a) => !isImageAttachment(a));

  return (
    <div className="space-y-2 pt-1.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, idx) => {
            const href = img.path || img.url || img.dataUrl || "#";
            return (
              <a
                key={img.id || `${img.name}-${idx}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="group relative block rounded-xl overflow-hidden border border-slate-200 bg-white shadow-2xs hover:border-indigo-400 transition-all"
                title={img.name}
              >
                <img
                  src={href}
                  alt={img.name}
                  className="max-h-32 max-w-48 object-cover block"
                />
                <span className="flex items-center justify-between gap-1 px-2 py-1 bg-slate-900/75 text-white text-micro truncate max-w-48">
                  <span className="truncate">{img.name}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-80" />
                </span>
              </a>
            );
          })}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((att, idx) => {
            const href = att.path || att.url || att.dataUrl || "#";
            return (
              <a
                key={att.id || `${att.name}-${idx}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                download={att.name}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-micro font-bold text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-52">{att.name}</span>
                {att.size && <span className="text-slate-400">({att.size})</span>}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};
