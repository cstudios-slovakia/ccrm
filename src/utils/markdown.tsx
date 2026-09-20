import React from "react";
import { FileText, User, Folder, CheckSquare, Receipt, Calendar, Sparkles, ExternalLink, ArrowRight } from "lucide-react";

export const EntityPill: React.FC<{ label: string; url: string }> = ({ label, url }) => {
  const handleEntityClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      window.location.hash = url;
      window.dispatchEvent(new CustomEvent("ccrm:navigate", { detail: { url } }));
    }
  };

  const rawHash = url.startsWith("#") ? url.slice(1).toLowerCase() : url.toLowerCase();
  
  let Icon = ArrowRight;
  let colorStyles = "bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700 hover:text-purple-900";
  let iconColor = "text-purple-600";

  if (rawHash.startsWith("client-") || rawHash === "clients") {
    Icon = User;
    colorStyles = "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800 hover:text-emerald-950";
    iconColor = "text-emerald-600";
  } else if (rawHash.startsWith("lead-") || rawHash === "leads") {
    Icon = Sparkles;
    colorStyles = "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-800 hover:text-indigo-950";
    iconColor = "text-indigo-600";
  } else if (rawHash.startsWith("project") || rawHash === "projects") {
    Icon = Folder;
    colorStyles = "bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800 hover:text-blue-950";
    iconColor = "text-blue-600";
  } else if (rawHash.startsWith("finance") || rawHash === "finances") {
    Icon = Receipt;
    colorStyles = "bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800 hover:text-amber-950";
    iconColor = "text-amber-600";
  } else if (rawHash === "tasks") {
    Icon = CheckSquare;
    colorStyles = "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-800 hover:text-rose-950";
    iconColor = "text-rose-600";
  } else if (rawHash === "meetings") {
    Icon = Calendar;
    colorStyles = "bg-cyan-50 hover:bg-cyan-100 border-cyan-200 text-cyan-800 hover:text-cyan-950";
    iconColor = "text-cyan-600";
  }

  return (
    <button
      type="button"
      onClick={handleEntityClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold transition-all cursor-pointer hover:scale-[1.03] active:scale-95 mx-1 my-0.5 select-none shadow-2xs group ${colorStyles}`}
      title={`Open ${label} in CRM`}
    >
      <Icon className={`h-3 w-3 shrink-0 ${iconColor} group-hover:scale-110 transition-transform`} />
      <span className="truncate max-w-[200px]">{label}</span>
      <ArrowRight className="h-2.5 w-2.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
    </button>
  );
};

export const FilePill: React.FC<{ fileName: string }> = ({ fileName }) => {
  const handlePillClick = () => {
    const leads = (window as any).leads;
    let foundEvent = null;
    if (leads && Array.isArray(leads)) {
      for (const lead of leads) {
        if (lead.timeline) {
          const ev = lead.timeline.find(
            (e: any) => e.fileName === fileName || (e.fileName && e.fileName.toLowerCase() === fileName.toLowerCase())
          );
          if (ev) {
            foundEvent = ev;
            break;
          }
        }
      }
    }

    if (foundEvent) {
      const url = `/uploads/${foundEvent.id}_${foundEvent.fileName}`;
      const ext = foundEvent.fileName.split('.').pop()?.toLowerCase() || '';
      const isShowable = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'txt'].includes(ext);

      if (isShowable && (window as any).previewFile) {
        (window as any).previewFile(url, foundEvent.fileName);
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = foundEvent.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } else {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(`File "${fileName}" not registered in database`);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handlePillClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 text-indigo-700 hover:text-indigo-800 text-[10.5px] font-black uppercase tracking-wide transition-all cursor-pointer hover:scale-[1.02] active:scale-95 mx-1 my-0.5 select-none"
    >
      <FileText className="h-3 w-3 text-indigo-500" />
      <span>{fileName}</span>
    </button>
  );
};

export const renderTextWithFilePills = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let index = 0;
  
  // Match standard filenames like Receipt-2723-3177-3915.pdf
  const fileRegex = /\b([\w\-_\.]+\.(?:pdf|png|jpe?g|gif|svg|webp|docx?|xlsx?|pptx?|txt|csv|zip))\b/gi;
  let match;
  
  while ((match = fileRegex.exec(text)) !== null) {
    if (match.index > index) {
      parts.push(text.substring(index, match.index));
    }
    
    const fileName = match[1];
    parts.push(
      <FilePill key={`file-pill-${match.index}`} fileName={fileName} />
    );
    
    index = fileRegex.lastIndex;
  }
  
  if (index < text.length) {
    parts.push(text.substring(index));
  }
  
  return parts.length > 0 ? parts : text;
};

// Safe, lightweight utility to convert basic markdown string into React elements
export const parseMarkdown = (text: string): React.ReactNode[] => {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  
  let currentListItems: React.ReactNode[] = [];
  let currentListType: "ul" | "ol" | null = null;
  let currentParagraphLines: string[] = [];
  let currentBlockquoteLines: string[] = [];

  let currentTableHeader: string[] = [];
  let currentTableRows: string[][] | null = null;

  let isCodeBlock = false;
  let currentCodeBlockLang = "";
  let currentCodeBlockLines: string[] = [];

  const isSeparatorLine = (line: string): boolean => {
    return /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(line);
  };

  const parseTableRow = (line: string): string[] => {
    const cells = line.split("|");
    if (cells[0].trim() === "") cells.shift();
    if (cells[cells.length - 1]?.trim() === "") cells.pop();
    return cells.map(c => c.trim());
  };

  const closeTable = (key: string) => {
    if (currentTableRows) {
      elements.push(
        <div key={`table-wrapper-${key}`} className="overflow-x-auto my-3 rounded-2xl border border-slate-200 shadow-sm max-w-full text-left">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-800 font-extrabold">
                {currentTableHeader.map((cell, idx) => (
                  <th key={idx} className="py-2.5 px-4 font-black uppercase tracking-wider text-[10px] text-slate-700">
                    {parseInlineStyles(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {currentTableRows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-slate-50/30 transition-colors">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="py-2.5 px-4 font-bold text-slate-600">
                      {parseInlineStyles(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      currentTableHeader = [];
      currentTableRows = null;
    }
  };

  const closeList = (key: string) => {
    if (currentListItems.length > 0) {
      if (currentListType === "ul") {
        elements.push(
          <ul key={`ul-${key}`} className="list-disc pl-5 my-2 space-y-1.5 text-left">
            {currentListItems}
          </ul>
        );
      } else if (currentListType === "ol") {
        elements.push(
          <ol key={`ol-${key}`} className="list-decimal pl-5 my-2 space-y-1.5 text-left">
            {currentListItems}
          </ol>
        );
      }
      currentListItems = [];
      currentListType = null;
    }
  };

  const closeBlockquote = (key: string) => {
    if (currentBlockquoteLines.length > 0) {
      elements.push(
        <blockquote key={`bq-${key}`} className="my-2.5 pl-3.5 border-l-4 border-indigo-400/80 bg-indigo-50/40 rounded-r-xl py-2 pr-3 text-xs italic text-slate-700 space-y-1">
          {currentBlockquoteLines.map((line, idx) => (
            <div key={idx}>{parseInlineStyles(line)}</div>
          ))}
        </blockquote>
      );
      currentBlockquoteLines = [];
    }
  };

  const closeParagraph = (key: string) => {
    if (currentParagraphLines.length > 0) {
      elements.push(
        <p key={`p-${key}`} className="mb-2 leading-relaxed text-left">
          {currentParagraphLines.map((line, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <br />}
              {parseInlineStyles(line)}
            </React.Fragment>
          ))}
        </p>
      );
      currentParagraphLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code block handling
    if (trimmed.startsWith("```")) {
      if (!isCodeBlock) {
        closeTable(`code-${i}`);
        closeList(`code-${i}`);
        closeParagraph(`code-${i}`);
        closeBlockquote(`code-${i}`);
        isCodeBlock = true;
        currentCodeBlockLang = trimmed.substring(3).trim();
        currentCodeBlockLines = [];
        continue;
      } else {
        elements.push(
          <div key={`codeblock-${i}`} className="my-3 rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 text-slate-100 shadow-sm text-left">
            {currentCodeBlockLang && (
              <div className="px-4 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                {currentCodeBlockLang}
              </div>
            )}
            <pre className="p-4 text-xs font-mono overflow-x-auto leading-relaxed">
              <code>{currentCodeBlockLines.join("\n")}</code>
            </pre>
          </div>
        );
        isCodeBlock = false;
        currentCodeBlockLang = "";
        currentCodeBlockLines = [];
        continue;
      }
    }

    if (isCodeBlock) {
      currentCodeBlockLines.push(line);
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^(\s*)>\s?(.*)$/);
    if (bqMatch) {
      closeTable(`bq-${i}`);
      closeList(`bq-${i}`);
      closeParagraph(`bq-${i}`);
      currentBlockquoteLines.push(bqMatch[2]);
      continue;
    } else if (currentBlockquoteLines.length > 0) {
      closeBlockquote(`bq-end-${i}`);
    }

    // Table parsing
    if (trimmed.startsWith("|")) {
      const isHeader = !currentTableRows && (i + 1 < lines.length && isSeparatorLine(lines[i + 1]));
      
      if (isHeader) {
        closeList(`table-hdr-${i}`);
        closeParagraph(`table-hdr-${i}`);
        closeBlockquote(`table-hdr-${i}`);
        
        currentTableHeader = parseTableRow(line);
        i++; // Skip the separator line
        currentTableRows = [];
        continue;
      } else if (currentTableRows) {
        if (isSeparatorLine(line)) {
          continue;
        }
        currentTableRows.push(parseTableRow(line));
        continue;
      }
    }

    if (!trimmed.startsWith("|") && currentTableRows) {
      closeTable(`table-close-${i}`);
    }

    // Horizontal Rule
    if (trimmed === "---") {
      closeTable(`hr-${i}`);
      closeList(`hr-${i}`);
      closeParagraph(`hr-${i}`);
      closeBlockquote(`hr-${i}`);
      elements.push(<hr key={`hr-${i}`} className="my-3 border-slate-200" />);
      continue;
    }

    // Headers
    if (trimmed.startsWith("#")) {
      closeTable(`h-${i}`);
      closeList(`h-${i}`);
      closeParagraph(`h-${i}`);
      closeBlockquote(`h-${i}`);
      
      const level = (trimmed.match(/^#+/) || [""])[0].length;
      const content = trimmed.substring(level).trim();
      const parsedContent = parseInlineStyles(content);

      if (level === 1) {
        elements.push(<h1 key={`h1-${i}`} className="text-sm font-black uppercase tracking-wider my-3 text-slate-800 border-b pb-1">{parsedContent}</h1>);
      } else if (level === 2) {
        elements.push(<h2 key={`h2-${i}`} className="text-xs font-black uppercase tracking-wider my-2 text-slate-800">{parsedContent}</h2>);
      } else {
        elements.push(<h3 key={`h3-${i}`} className="text-[10px] font-black uppercase tracking-wider my-1.5 text-slate-700">{parsedContent}</h3>);
      }
      continue;
    }

    // Unordered List Item
    const ulMatch = line.match(/^(\s*)([-*])\s+(.*)$/);
    if (ulMatch) {
      closeTable(`ul-item-${i}`);
      closeParagraph(`ul-item-${i}`);
      closeBlockquote(`ul-item-${i}`);
      if (currentListType !== "ul") {
        closeList(`ul-switch-${i}`);
        currentListType = "ul";
      }
      const indent = ulMatch[1].length;
      const content = ulMatch[3];
      currentListItems.push(
        <li key={`li-${i}`} style={{ marginLeft: `${indent * 6}px` }} className="text-xs font-medium text-slate-700">
          {parseInlineStyles(content)}
        </li>
      );
      continue;
    }

    // Ordered List Item
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (olMatch) {
      closeTable(`ol-item-${i}`);
      closeParagraph(`ol-item-${i}`);
      closeBlockquote(`ol-item-${i}`);
      if (currentListType !== "ol") {
        closeList(`ol-switch-${i}`);
        currentListType = "ol";
      }
      const indent = olMatch[1].length;
      const itemNum = parseInt(olMatch[2], 10);
      const content = olMatch[3];
      currentListItems.push(
        <li 
          key={`li-${i}`} 
          value={isNaN(itemNum) ? undefined : itemNum}
          style={{ marginLeft: `${indent * 6}px` }} 
          className="text-xs font-medium text-slate-700"
        >
          {parseInlineStyles(content)}
        </li>
      );
      continue;
    }

    // Empty line
    if (trimmed === "") {
      closeTable(`empty-${i}`);
      closeList(`empty-${i}`);
      closeParagraph(`empty-${i}`);
      closeBlockquote(`empty-${i}`);
      continue;
    }

    // Regular line
    closeTable(`text-${i}`);
    closeList(`text-${i}`);
    closeBlockquote(`text-${i}`);
    currentParagraphLines.push(line);
  }

  // Flush remaining blocks
  closeTable("final-table");
  closeList("final-list");
  closeParagraph("final-paragraph");
  closeBlockquote("final-bq");

  return elements;
};

// Parser for inline styles: bold (**text**), italic (*text*), code (`code`), links ([text](url))
const parseInlineStyles = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let index = 0;

  // Regex matches: **bold** / __bold__, *italic* / _italic_, `code`, [link](url)
  const inlineRegex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3|(`)(.*?)\5|\[(.*?)\]\(((?:https?:\/\/|\/|#)[^\s\)]+)\)/g;
  let match;

  const parseInnerStyles = (inner: string): React.ReactNode => {
    if (!/[*_`\[]/.test(inner)) {
      return renderTextWithFilePills(inner);
    }
    return parseInlineStyles(inner);
  };

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add preceding plain text
    if (match.index > index) {
      parts.push(renderTextWithFilePills(text.substring(index, match.index)));
    }

    if (match[1]) {
      // Bold
      parts.push(<strong key={match.index} className="font-extrabold text-slate-900">{parseInnerStyles(match[2])}</strong>);
    } else if (match[3]) {
      // Italic
      parts.push(<em key={match.index} className="italic text-slate-800">{parseInnerStyles(match[4])}</em>);
    } else if (match[5]) {
      // Inline Code
      parts.push(<code key={match.index} className="bg-slate-100/80 px-1 py-0.5 rounded text-[10.5px] font-mono text-purple-700 border border-slate-200/50">{match[6]}</code>);
    } else if (match[7] && match[8]) {
      const linkLabel = match[7];
      const linkUrl = match[8];

      // If URL is an internal hash route (e.g. #client-Silvia, #projects, #lead-12), render an interactive EntityPill
      if (linkUrl.startsWith("#")) {
        parts.push(
          <EntityPill key={match.index} label={linkLabel} url={linkUrl} />
        );
      } else {
        // External link [label](url)
        parts.push(
          <a 
            key={match.index} 
            href={linkUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-indigo-600 hover:text-indigo-800 underline font-semibold transition inline-flex items-center gap-0.5"
          >
            <span>{linkLabel}</span>
            <ExternalLink className="h-2.5 w-2.5 inline" />
          </a>
        );
      }
    }

    index = inlineRegex.lastIndex;
  }

  // Add remaining plain text
  if (index < text.length) {
    parts.push(renderTextWithFilePills(text.substring(index)));
  }

  return parts.length > 0 ? parts : renderTextWithFilePills(text);
};

interface MarkdownProps {
  content: string;
  className?: string;
}

export const Markdown: React.FC<MarkdownProps> = ({ content, className = "space-y-1.5" }) => {
  return <div className={className}>{parseMarkdown(content || "")}</div>;
};
