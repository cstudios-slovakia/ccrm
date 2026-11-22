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

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link"]);

const decodeHtmlEntities = (text: string): string =>
  text
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

interface HtmlTokenNode {
  tag: string;
  attrs: Record<string, string>;
  children: (HtmlTokenNode | string)[];
}

const parseHtmlAttrs = (rawAttrs: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const attrRe = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(rawAttrs)) !== null) {
    attrs[m[1].toLowerCase()] = decodeHtmlEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
};

const parseInlineHtmlTree = (html: string): HtmlTokenNode => {
  const root: HtmlTokenNode = { tag: "root", attrs: {}, children: [] };
  const stack: HtmlTokenNode[] = [root];
  const tokenRe = /<(\/?)([a-zA-Z0-9-]+)([^>]*?)(\/?)>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(html)) !== null) {
    if (m.index > lastIndex) {
      stack[stack.length - 1].children.push(decodeHtmlEntities(html.slice(lastIndex, m.index)));
    }
    const isClosing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const rawAttrs = m[3] || "";
    const selfClosing = m[4] === "/" || VOID_TAGS.has(tag);

    if (isClosing) {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
    } else {
      const node: HtmlTokenNode = { tag, attrs: parseHtmlAttrs(rawAttrs), children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
    }
    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < html.length) {
    stack[stack.length - 1].children.push(decodeHtmlEntities(html.slice(lastIndex)));
  }
  return root;
};

const wrapInlineMarker = (inner: string, open: string, close = open): string => {
  if (!inner) return "";
  const trimmed = inner.trim();
  if (!trimmed) return inner;
  const lead = inner.match(/^\s*/)?.[0] ?? "";
  const trail = inner.match(/\s*$/)?.[0] ?? "";
  return `${lead}${open}${trimmed}${close}${trail}`;
};

const formatInlineCode = (text: string): string => {
  if (!text) return "";
  const maxRun = (text.match(/`+/g) || []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(maxRun + 1);
  const needsPad = text.startsWith("`") || text.endsWith("`");
  return needsPad ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
};

const renderNodeChildren = (node: HtmlTokenNode): string => {
  let out = "";
  node.children.forEach((child, idx) => {
    if (typeof child === "string") {
      out += child;
      return;
    }
    if ((child.tag === "div" || child.tag === "p") && idx > 0 && out && !out.endsWith("\n")) {
      out += "\n";
    }
    out += nodeToMarkdown(child);
  });
  return out;
};

const extractPlainFromNode = (node: HtmlTokenNode): string =>
  node.children
    .map((child) => {
      if (typeof child === "string") return child;
      if (child.tag === "br") return "\n";
      return extractPlainFromNode(child);
    })
    .join("");

const nodeToMarkdown = (node: HtmlTokenNode): string => {
  if (node.tag === "br") return "\n";

  const cls = node.attrs.class || "";
  const style = node.attrs.style || "";

  if (node.tag === "code" || (node.tag === "span" && /\bfont-mono\b/.test(cls))) {
    return formatInlineCode(extractPlainFromNode(node).replace(/\u00a0/g, " "));
  }

  const inner = renderNodeChildren(node);

  if (node.tag === "b" || node.tag === "strong") {
    return wrapInlineMarker(inner, "**");
  }
  if (node.tag === "i" || node.tag === "em") {
    return wrapInlineMarker(inner, "*");
  }
  if (node.tag === "s" || node.tag === "strike" || node.tag === "del") {
    return wrapInlineMarker(inner, "~~");
  }
  if (node.tag === "u") {
    return wrapInlineMarker(inner, "<u>", "</u>");
  }
  if (node.tag === "a") {
    const href = (node.attrs.href || "").trim();
    const label = inner.trim() || href;
    if (!href) return label;
    return `[${label}](${href.replace(/\)/g, "%29")})`;
  }
  if (node.tag === "span") {
    let styled = inner;
    if (/font-weight\s*:\s*(?:bold|[6-9]00)/i.test(style)) styled = wrapInlineMarker(styled, "**");
    if (/font-style\s*:\s*italic/i.test(style)) styled = wrapInlineMarker(styled, "*");
    if (/text-decoration(?:-line)?\s*:[^;]*line-through/i.test(style)) styled = wrapInlineMarker(styled, "~~");
    return styled;
  }

  return inner;
};

/**
 * Converts `BlockEditor` inline HTML (`<b>`, `<i>`, `<s>`, `<u>`, links, inline code spans)
 * into clean Markdown text. Runs deterministically in both Browser and Node.js.
 */
export const inlineHtmlToMarkdown = (html: string): string => {
  if (!html) return "";
  const tree = parseInlineHtmlTree(html);
  return renderNodeChildren(tree)
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n");
};

const bannerAlertTag = (block: Pick<EditorBlock, "bannerColor" | "bannerType">): string => {
  const { color } = getBannerStyles(block);
  if (color === "yellow") return "[!WARNING]";
  if (color === "green") return "[!TIP]";
  if (color === "red") return "[!CAUTION]";
  return "[!NOTE]";
};

const isListBlockType = (type: EditorBlock["type"]): boolean =>
  type === "bullet" || type === "number" || type === "todo";

/**
 * Converts an array of `EditorBlock` objects into GitHub-Flavored Markdown.
 */
export const blocksToMarkdown = (blocks: EditorBlock[]): string => {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";

  const rendered: { type: EditorBlock["type"]; text: string }[] = [];
  let numberSeq = 0;

  for (const block of blocks) {
    if (block.type === "number") {
      numberSeq += 1;
    } else {
      numberSeq = 0;
    }

    if (block.type === "code") {
      const codeText = plainBlockText(block.content || "").replace(/\s+$/g, "");
      const maxFence = (codeText.match(/`{3,}/g) || []).reduce((m, run) => Math.max(m, run.length), 2);
      const fence = "`".repeat(maxFence + 1);
      const lang = (block.codeLanguage || "").trim();
      rendered.push({ type: block.type, text: `${fence}${lang}\n${codeText}\n${fence}` });
      continue;
    }

    const mdText = inlineHtmlToMarkdown(block.content || "").trim();

    switch (block.type) {
      case "h1":
        if (mdText) rendered.push({ type: block.type, text: `# ${mdText.replace(/\n+/g, " ")}` });
        break;
      case "h2":
        if (mdText) rendered.push({ type: block.type, text: `## ${mdText.replace(/\n+/g, " ")}` });
        break;
      case "h3":
        if (mdText) rendered.push({ type: block.type, text: `### ${mdText.replace(/\n+/g, " ")}` });
        break;
      case "h4":
        if (mdText) rendered.push({ type: block.type, text: `#### ${mdText.replace(/\n+/g, " ")}` });
        break;
      case "todo":
        rendered.push({
          type: block.type,
          text: `- [${block.checked ? "x" : " "}] ${mdText.replace(/\n+/g, "\n  ")}`,
        });
        break;
      case "bullet":
        rendered.push({ type: block.type, text: `- ${mdText.replace(/\n+/g, "\n  ")}` });
        break;
      case "number":
        rendered.push({ type: block.type, text: `${numberSeq}. ${mdText.replace(/\n+/g, "\n   ")}` });
        break;
      case "toggle": {
        const sub = block.toggleContent ? inlineHtmlToMarkdown(block.toggleContent).trim() : "";
        if (!mdText && !sub) break;
        const header = mdText ? `- **${mdText.replace(/\n+/g, " ")}**` : "-";
        if (sub) {
          const indented = sub
            .split("\n")
            .map((line) => (line.trim() ? `  ${line}` : ""))
            .join("\n");
          rendered.push({ type: block.type, text: `${header}\n${indented}` });
        } else {
          rendered.push({ type: block.type, text: header });
        }
        break;
      }
      case "banner": {
        const tag = bannerAlertTag(block);
        const bodyLines = mdText
          ? mdText.split("\n").map((line) => (line ? `> ${line}` : ">"))
          : [];
        rendered.push({
          type: block.type,
          text: [`> ${tag}`, ...bodyLines].join("\n"),
        });
        break;
      }
      case "quote":
        if (mdText) {
          rendered.push({
            type: block.type,
            text: mdText
              .split("\n")
              .map((line) => (line ? `> ${line}` : ">"))
              .join("\n"),
          });
        }
        break;
      case "pullquote":
        if (mdText) {
          rendered.push({
            type: block.type,
            text: mdText
              .split("\n")
              .map((line) => (line.trim() ? `> *${line.trim()}*` : ">"))
              .join("\n"),
          });
        }
        break;
      default:
        if (mdText) rendered.push({ type: block.type, text: mdText });
        break;
    }
  }

  let out = "";
  for (let i = 0; i < rendered.length; i++) {
    if (i > 0) {
      const prev = rendered[i - 1];
      const curr = rendered[i];
      const sameListRun = isListBlockType(prev.type) && prev.type === curr.type;
      out += sameListRun ? "\n" : "\n\n";
    }
    out += rendered[i].text;
  }
  return out.trim();
};

/**
 * Converts any stored note or task description string (JSON blocks or plain text) into Markdown.
 */
export const blockNotesToMarkdown = (raw?: string | null): string => {
  if (!raw) return "";
  if (isSerializedBlockArray(raw)) {
    return blocksToMarkdown(parseNotesToBlocks(raw));
  }
  return raw.trim();
};

/**
 * Derives a clean `.md` download filename from an optional document/task title.
 */
export const exportMarkdownFilename = (title?: string | null, fallback = "notes"): string => {
  const base = (title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${base || fallback}.md`;
};

