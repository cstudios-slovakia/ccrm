/**
 * Zero-dependency, XSS-safe basic Markdown renderer & plain-text stripper
 * shared by the CRM web app and the Chrome Side Panel extension for work reports.
 *
 * Supported syntax:
 *   - Headings: `# `, `## `, `### `
 *   - Unordered lists: `- item` or `* item`
 *   - Ordered lists: `1. item`
 *   - Inline: `**bold**`, `*italic*`, `` `code` ``
 *   - Paragraphs & line breaks
 */

const escapeHtml = (raw: string): string =>
  raw.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));

const formatInline = (raw: string): string => {
  // Extract inline code spans first so bold/italic markers inside code stay literal.
  const codes: string[] = [];
  let text = escapeHtml(raw).replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const idx = codes.push(`<code>${code}</code>`) - 1;
    return `\u0000CODE${idx}\u0000`;
  });
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return text.replace(/\u0000CODE(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] || "");
};

/** Render basic Markdown to sanitized HTML (all raw HTML is escaped first). */
export function renderBasicMarkdown(input: string): string {
  const normalized = String(input ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const lines = normalized.split("\n");
  const out: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${para.map(formatInline).join("<br />")}</p>`);
    para = [];
  };
  const closeList = () => {
    if (!listKind) return;
    out.push(`</${listKind}>`);
    listKind = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      closeList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1].length + 2; // h3..h5 so report headings stay compact inside cards/drawers
      out.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      continue;
    }
    const ul = trimmed.match(/^[-*]\s+(.+)$/);
    if (ul) {
      flushPara();
      if (listKind !== "ul") {
        closeList();
        out.push("<ul>");
        listKind = "ul";
      }
      out.push(`<li>${formatInline(ul[1])}</li>`);
      continue;
    }
    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      if (listKind !== "ol") {
        closeList();
        out.push("<ol>");
        listKind = "ol";
      }
      out.push(`<li>${formatInline(ol[1])}</li>`);
      continue;
    }
    closeList();
    para.push(trimmed);
  }
  flushPara();
  closeList();
  return out.join("");
}

/** Collapse basic Markdown syntax into a clean single-line summary for compact table/list rows. */
export function stripBasicMarkdown(input: string): string {
  return String(input ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^#{1,3}\s+/, "")
        .replace(/^[-*]\s+/, "• ")
        .replace(/^\d+\.\s+/, "")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1$2")
    )
    .filter(Boolean)
    .join(" · ");
}

/** Apply a basic Markdown formatting token around the current textarea selection. */
export function applyMarkdownFormat(
  value: string,
  start: number,
  end: number,
  kind: "bold" | "italic" | "code" | "bullet"
): { value: string; selectionStart: number; selectionEnd: number } {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  if (kind === "bullet") {
    const needsNewline = before.length > 0 && !before.endsWith("\n");
    const prefix = needsNewline ? "\n- " : "- ";
    const body = selected ? selected.split("\n").join("\n- ") : "";
    const next = `${before}${prefix}${body}${after}`;
    const pos = before.length + prefix.length + body.length;
    return { value: next, selectionStart: pos, selectionEnd: pos };
  }
  const wrap = kind === "bold" ? "**" : kind === "italic" ? "*" : "`";
  const inner = selected || (kind === "bold" ? "text" : kind === "italic" ? "text" : "code");
  const next = `${before}${wrap}${inner}${wrap}${after}`;
  const selStart = before.length + wrap.length;
  return { value: next, selectionStart: selStart, selectionEnd: selStart + inner.length };
}
