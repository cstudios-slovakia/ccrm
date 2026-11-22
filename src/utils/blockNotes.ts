import { escapeHtml, htmlToText } from "./safeHtml.ts";

export interface EditorBlock {
  id: string;
  type:
    | "paragraph"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "todo"
    | "bullet"
    | "number"
    | "toggle"
    | "banner"
    | "code"
    | "quote"
    | "pullquote";
  content: string;
  checked?: boolean;
  toggled?: boolean;
  toggleContent?: string;
  bannerType?: "info" | "warning" | "success" | "danger";
  bannerColor?: "blue" | "green" | "yellow" | "red" | "purple" | "orange" | "gray";
  bannerVariant?: "light" | "saturated";
  codeLanguage?: string;
  align?: "left" | "center" | "right" | "justify";
}

export const BANNER_COLORS = [
  "blue",
  "green",
  "yellow",
  "red",
  "purple",
  "orange",
  "gray",
] as const;

export const BANNER_THEMES: Record<
  string,
  {
    light: string;
    saturated: string;
    previewLight: string;
    previewSat: string;
  }
> = {
  blue: {
    light: "bg-blue-50/50 border-blue-200/50 text-blue-900",
    saturated: "bg-blue-600 border-blue-700 text-white",
    previewLight: "bg-blue-100 border-blue-200",
    previewSat: "bg-blue-600 border-blue-700",
  },
  green: {
    light: "bg-emerald-50/50 border-emerald-200/50 text-emerald-900",
    saturated: "bg-emerald-600 border-emerald-700 text-white",
    previewLight: "bg-emerald-100 border-emerald-200",
    previewSat: "bg-emerald-600 border-emerald-700",
  },
  yellow: {
    light: "bg-amber-50/50 border-amber-200/50 text-amber-900",
    saturated: "bg-amber-500 border-amber-600 text-white",
    previewLight: "bg-amber-100 border-amber-200",
    previewSat: "bg-amber-500 border-amber-600",
  },
  red: {
    light: "bg-rose-50/50 border-rose-200/50 text-rose-900",
    saturated: "bg-rose-600 border-rose-700 text-white",
    previewLight: "bg-rose-100 border-rose-200",
    previewSat: "bg-rose-600 border-rose-700",
  },
  purple: {
    light: "bg-purple-50/50 border-purple-200/50 text-purple-900",
    saturated: "bg-purple-600 border-purple-700 text-white",
    previewLight: "bg-purple-100 border-purple-200",
    previewSat: "bg-purple-600 border-purple-700",
  },
  orange: {
    light: "bg-orange-50/50 border-orange-200/50 text-orange-900",
    saturated: "bg-orange-500 border-orange-600 text-white",
    previewLight: "bg-orange-100 border-orange-200",
    previewSat: "bg-orange-500 border-orange-600",
  },
  gray: {
    light: "bg-slate-50/50 border-slate-200/50 text-slate-900",
    saturated: "bg-slate-700 border-slate-800 text-white",
    previewLight: "bg-slate-100 border-slate-200",
    previewSat: "bg-slate-700 border-slate-800",
  },
};

export const getBannerStyles = (block: Pick<EditorBlock, "bannerColor" | "bannerVariant" | "bannerType">) => {
  let color = block.bannerColor;
  const variant = block.bannerVariant || "light";

  if (!color) {
    if (block.bannerType === "warning") color = "yellow";
    else if (block.bannerType === "success") color = "green";
    else if (block.bannerType === "danger") color = "red";
    else color = "blue";
  }

  const theme = BANNER_THEMES[color] || BANNER_THEMES.blue;
  const classes = variant === "saturated" ? theme.saturated : theme.light;
  return { classes, color, variant };
};

const VALID_BLOCK_TYPES = new Set<string>([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "h4",
  "todo",
  "bullet",
  "number",
  "toggle",
  "banner",
  "code",
  "quote",
  "pullquote",
]);

/**
 * Returns true when `raw` is a JSON-serialized array of `EditorBlock` objects
 * (shared across Meeting Notes, Client/Lead block logs, and rich Task Descriptions).
 */
export const isSerializedBlockArray = (raw?: string | null): boolean => {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as EditorBlock).type === "string" &&
          VALID_BLOCK_TYPES.has((item as EditorBlock).type),
      )
    );
  } catch {
    return false;
  }
};

/**
 * Parses either a JSON `EditorBlock[]` string or plain text into blocks for `<BlockEditor>`.
 */
export const parseNotesToBlocks = (raw?: string | null): EditorBlock[] => {
  const safe = typeof raw === "string" ? raw : "";
  if (safe.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(safe);
      if (Array.isArray(parsed)) {
        return parsed.length > 0 ? parsed : [{ id: "b-1", type: "paragraph", content: "" }];
      }
    } catch {
      // Plain text starting with '[' (e.g. "[TCK-12] note") falls through cleanly.
    }
  }
  if (!safe.trim()) {
    return [{ id: "b-1", type: "paragraph", content: "" }];
  }
  return safe.split("\n").map((line, idx) => ({
    id: `b-init-${idx}`,
    type: "paragraph" as const,
    content: line.trim() ? escapeHtml(line) : "",
  }));
};

const decodeNodeEntities = (text: string): string =>
  typeof DOMParser !== "undefined"
    ? text
    : text
        .replace(/&nbsp;/gi, " ")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

const plainBlockText = (html: string): string =>
  decodeNodeEntities(htmlToText((html || "").replace(/<br\s*\/?>/gi, "\n"))).replace(/\u00a0/g, " ");

/**
 * Converts an array of `EditorBlock`s into clean searchable/printable plain text.
 */
export const serializeBlocksToPlainText = (blocks: EditorBlock[]): string => {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  return blocks
    .map((b) => {
      const main = plainBlockText(b.content || "");
      const sub = b.type === "toggle" && b.toggleContent ? plainBlockText(b.toggleContent) : "";
      if (main && sub) return `${main}\n${sub}`;
      return main || sub;
    })
    .join("\n")
    .trim();
};

/**
 * Extracts readable plain text from any stored note or task description
 * (serialized `EditorBlock[]` JSON or legacy plain text).
 */
export const blockNotesToPlainText = (raw?: string | null): string => {
  if (!raw) return "";
  if (isSerializedBlockArray(raw)) {
    return serializeBlocksToPlainText(parseNotesToBlocks(raw));
  }
  return raw;
};

const hasRichInlineMarkup = (html: string): boolean => {
  const strippedBr = (html || "").replace(/<br\s*\/?>/gi, "");
  return /<[a-z!/]/i.test(strippedBr);
};

const hasOnlyPlainParagraphs = (blocks: EditorBlock[]): boolean =>
  blocks.every(
    (b) =>
      b.type === "paragraph" &&
      (!b.align || b.align === "left") &&
      !hasRichInlineMarkup(b.content || ""),
  );

/**
 * Serializes `BlockEditor` state for `task.description`:
 * - Empty editor -> `""`
 * - Plain unformatted paragraphs -> plain text joined by `\n`
 * - Any rich block type (heading, checklist, list, toggle, banner, code, quote, inline formatting, align) -> JSON `EditorBlock[]`
 */
export const serializeTaskDescription = (blocks: EditorBlock[]): string => {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  if (hasOnlyPlainParagraphs(blocks)) {
    return blocks.map((b) => plainBlockText(b.content || "")).join("\n").trim();
  }
  const hasAnyTextOrStructure = blocks.some(
    (b) =>
      b.type !== "paragraph" ||
      plainBlockText(b.content || "").trim() !== "" ||
      hasRichInlineMarkup(b.content || ""),
  );
  return hasAnyTextOrStructure ? JSON.stringify(blocks) : "";
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripTagFromHtmlTextNodes = (html: string, tagRegex: RegExp): string =>
  html
    .split(/(<[^>]+>)/g)
    .map((segment) => (segment.startsWith("<") ? segment : segment.replace(tagRegex, "")))
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();

/**
 * Removes `#tag` occurrences from a task description without corrupting JSON
 * or inline style attributes (such as `style="color: #ef4444"`).
 */
export const removeTagFromDescription = (raw: string, tag: string): string => {
  if (!raw || !tag) return raw;
  const tagRegex = new RegExp(`#${escapeRegex(tag)}(?![\\w\\u00C0-\\u024F\\u1E00-\\u1EFF-])`, "gi");
  if (isSerializedBlockArray(raw)) {
    const blocks = parseNotesToBlocks(raw).map((b) => ({
      ...b,
      content: stripTagFromHtmlTextNodes(b.content || "", tagRegex),
      ...(b.toggleContent !== undefined
        ? { toggleContent: stripTagFromHtmlTextNodes(b.toggleContent || "", tagRegex) }
        : {}),
    }));
    return serializeTaskDescription(blocks);
  }
  return raw.replace(tagRegex, "").replace(/[ \t]{2,}/g, " ").trim();
};
