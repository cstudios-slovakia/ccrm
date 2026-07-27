import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, GripVertical, Bold, Italic, Underline, Strikethrough, Code, 
  Link2, Palette, Trash, Heading1, Heading2, Heading3, Type, CheckSquare, 
  List, ListOrdered, ChevronRight, Info, AlertTriangle, CheckCircle2, 
  XCircle, Terminal, Quote, FileText, Highlighter
} from "lucide-react";
import { cn } from "../utils/cn";
import { getTranslation } from "../utils/translations";

export interface EditorBlock {
  id: string;
  type: 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'todo' | 'bullet' | 'number' | 'toggle' | 'banner' | 'code' | 'quote' | 'pullquote';
  content: string;
  checked?: boolean;
  toggled?: boolean;
  toggleContent?: string;
  bannerType?: 'info' | 'warning' | 'success' | 'danger';
  bannerColor?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange' | 'gray';
  bannerVariant?: 'light' | 'saturated';
  codeLanguage?: string;
  align?: 'left' | 'center' | 'right' | 'justify';
}

interface BlockEditorProps {
  initialBlocks?: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
  systemLanguage?: "en" | "sk" | "hu";
}

const DEFAULT_BLOCKS: EditorBlock[] = [
  { id: "b-1", type: "paragraph", content: "Write some meeting notes here..." }
];

interface EditableBlockProps {
  content: string;
  onChange: (html: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLDivElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  innerRef: (el: HTMLDivElement | null) => void;
  placeholder?: string;
}

const EditableBlock: React.FC<EditableBlockProps> = ({
  content,
  onChange,
  onKeyDown,
  onBlur,
  className,
  style,
  innerRef,
  placeholder
}) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const lastContentRef = useRef(content);

  useEffect(() => {
    if (elementRef.current && elementRef.current.innerHTML !== content) {
      elementRef.current.innerHTML = content;
      lastContentRef.current = content;
    }
  }, [content]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    lastContentRef.current = html;
    onChange(html);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    
    // Clean up list bullets, custom arrow artifacts, and inline bullets:
    // This targets markers like ->, =>, -->, ==>, bullet symbols, and unicode arrows
    let cleanedText = text
      .replace(/^[\s]*([-\u2014\u2013=>➔➜➢➤➝➞➟➣➥➦➛➪➫➬➭➮➯➱➲➳➴➵➶➷➸•◦▪▫]+|\-\-+|\=\=+)\s+/gm, "")
      .replace(/[\u2022\u25E6\u25AA\u25AB\u2023\u2043\u25C8]/g, "");

    document.execCommand("insertText", false, cleanedText);
  };

  return (
    <div
      ref={(el) => {
        elementRef.current = el;
        innerRef(el);
      }}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onPaste={handlePaste}
      className={className}
      style={style}
      data-placeholder={placeholder}
    />
  );
};

const BLOCK_OPTIONS = [
  { id: "paragraph", type: "paragraph", label: "Normal Text", group: "basic", icon: Type },
  { id: "h1", type: "h1", label: "Heading 1", group: "basic", icon: Heading1 },
  { id: "h2", type: "h2", label: "Heading 2", group: "basic", icon: Heading2 },
  { id: "h3", type: "h3", label: "Heading 3", group: "basic", icon: Heading3 },
  { id: "todo", type: "todo", label: "Checklist", group: "basic", icon: CheckSquare },
  { id: "bullet", type: "bullet", label: "Bulleted List", group: "basic", icon: List },
  { id: "number", type: "number", label: "Numbered List", group: "basic", icon: ListOrdered },
  { id: "toggle", type: "toggle", label: "Toggle List", group: "basic", icon: ChevronRight },
  
  { id: "banner-info", type: "banner", label: "Info Banner", group: "advanced", icon: Info, extra: { bannerType: "info" } },
  { id: "banner-warning", type: "banner", label: "Warning Banner", group: "advanced", icon: AlertTriangle, extra: { bannerType: "warning" } },
  { id: "banner-success", type: "banner", label: "Success Banner", group: "advanced", icon: CheckCircle2, extra: { bannerType: "success" } },
  { id: "banner-danger", type: "banner", label: "Danger Banner", group: "advanced", icon: XCircle, extra: { bannerType: "danger" } },
  { id: "code", type: "code", label: "Code Block", group: "advanced", icon: Terminal },
  { id: "quote", type: "quote", label: "Block Quote", group: "advanced", icon: Quote },
  { id: "pullquote", type: "pullquote", label: "Pull Quote", group: "advanced", icon: FileText },
  { id: "delete", type: "delete" as any, label: "Delete Block", group: "advanced", icon: Trash }
];

// Slash-menu labels live next to the option list rather than inside it so
// BLOCK_OPTIONS stays a plain module constant while the visible text (and the
// text the slash-search matches against) follows the workspace language.
const BLOCK_LABELS: Record<string, [string, string, string]> = {
  paragraph: ["Normal Text", "Bežný text", "Normál szöveg"],
  h1: ["Heading 1", "Nadpis 1", "Címsor 1"],
  h2: ["Heading 2", "Nadpis 2", "Címsor 2"],
  h3: ["Heading 3", "Nadpis 3", "Címsor 3"],
  todo: ["Checklist", "Zoznam úloh", "Teendőlista"],
  bullet: ["Bulleted List", "Odrážkový zoznam", "Felsorolás"],
  number: ["Numbered List", "Číslovaný zoznam", "Számozott lista"],
  toggle: ["Toggle List", "Rozbaľovací zoznam", "Lenyíló lista"],
  "banner-info": ["Info Banner", "Informačný banner", "Információs sáv"],
  "banner-warning": ["Warning Banner", "Varovný banner", "Figyelmeztető sáv"],
  "banner-success": ["Success Banner", "Banner úspechu", "Sikeres sáv"],
  "banner-danger": ["Danger Banner", "Banner nebezpečenstva", "Veszély sáv"],
  code: ["Code Block", "Blok kódu", "Kódblokk"],
  quote: ["Block Quote", "Citát", "Idézet"],
  pullquote: ["Pull Quote", "Zvýraznený citát", "Kiemelt idézet"],
  delete: ["Delete Block", "Odstrániť blok", "Blokk törlése"],
};

const BANNER_COLORS = ["blue", "green", "yellow", "red", "purple", "orange", "gray"] as const;

const BANNER_THEMES: Record<string, {
  light: string;
  saturated: string;
  previewLight: string;
  previewSat: string;
}> = {
  blue: {
    light: "bg-blue-50/50 border-blue-200/50 text-blue-900",
    saturated: "bg-blue-600 border-blue-700 text-white",
    previewLight: "bg-blue-100 border-blue-200",
    previewSat: "bg-blue-600 border-blue-700"
  },
  green: {
    light: "bg-emerald-50/50 border-emerald-250/50 text-emerald-900",
    saturated: "bg-emerald-600 border-emerald-700 text-white",
    previewLight: "bg-emerald-100 border-emerald-200",
    previewSat: "bg-emerald-600 border-emerald-700"
  },
  yellow: {
    light: "bg-amber-50/50 border-amber-200/50 text-amber-900",
    saturated: "bg-amber-500 border-amber-600 text-white",
    previewLight: "bg-amber-100 border-amber-200",
    previewSat: "bg-amber-500 border-amber-600"
  },
  red: {
    light: "bg-rose-50/50 border-rose-250/50 text-rose-900",
    saturated: "bg-rose-600 border-rose-700 text-white",
    previewLight: "bg-rose-100 border-rose-200",
    previewSat: "bg-rose-600 border-rose-700"
  },
  purple: {
    light: "bg-purple-50/50 border-purple-200/50 text-purple-900",
    saturated: "bg-purple-600 border-purple-700 text-white",
    previewLight: "bg-purple-100 border-purple-200",
    previewSat: "bg-purple-600 border-purple-700"
  },
  orange: {
    light: "bg-orange-50/50 border-orange-200/50 text-orange-900",
    saturated: "bg-orange-500 border-orange-600 text-white",
    previewLight: "bg-orange-100 border-orange-200",
    previewSat: "bg-orange-500 border-orange-600"
  },
  gray: {
    light: "bg-slate-50/50 border-slate-200/50 text-slate-900",
    saturated: "bg-slate-700 border-slate-800 text-white",
    previewLight: "bg-slate-100 border-slate-200",
    previewSat: "bg-slate-700 border-slate-800"
  }
};

const getBannerStyles = (block: EditorBlock) => {
  let color = block.bannerColor;
  let variant = block.bannerVariant || "light";
  
  if (!color) {
    if (block.bannerType === "warning") {
      color = "yellow";
    } else if (block.bannerType === "success") {
      color = "green";
    } else if (block.bannerType === "danger") {
      color = "red";
    } else {
      color = "blue"; // default is blue
    }
  }

  const theme = BANNER_THEMES[color] || BANNER_THEMES.blue;
  const classes = variant === "saturated" ? theme.saturated : theme.light;
  
  return { classes, color, variant };
};

const getBannerIcon = (color: string, variant: string) => {
  const iconClass = "h-5 w-5 shrink-0 select-none " + (variant === "saturated" ? "text-white" : "");
  const colorClass = variant === "saturated" ? "" : (
    color === "yellow" ? "text-amber-500" :
    color === "green" ? "text-emerald-500" :
    color === "red" ? "text-rose-500" :
    color === "purple" ? "text-purple-500" :
    color === "orange" ? "text-orange-500" :
    color === "gray" ? "text-slate-550" :
    "text-blue-500"
  );
  
  const finalClass = `${iconClass} ${colorClass}`;

  if (color === "yellow") return <AlertTriangle className={finalClass} />;
  if (color === "green") return <CheckCircle2 className={finalClass} />;
  if (color === "red") return <XCircle className={finalClass} />;
  return <Info className={finalClass} />;
};

export const BlockEditor: React.FC<BlockEditorProps> = ({
  initialBlocks,
  onChange,
  systemLanguage = "en"
}) => {
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => {
    if (initialBlocks && initialBlocks.length > 0) return initialBlocks;
    return DEFAULT_BLOCKS;
  });

  // Track the ID of the block that should be focused
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  
  // Selection toolbar state
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarCoords, setToolbarCoords] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Block menu/popover state
  const [activeMenuBlockId, setActiveMenuBlockId] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);

  const filteredOptions = BLOCK_OPTIONS
    .map(opt => {
      const label = BLOCK_LABELS[opt.id];
      return label ? { ...opt, label: t(label[0], label[1], label[2]) } : opt;
    })
    .filter(opt => opt.label.toLowerCase().includes(slashQuery.toLowerCase()));

  const basicFiltered = filteredOptions.filter(o => o.group === "basic");
  const advancedFiltered = filteredOptions.filter(o => o.group === "advanced");

  // Reset selected menu index when query changes to prevent out of bounds
  useEffect(() => {
    setSelectedMenuIndex(0);
  }, [slashQuery]);

  // Refs for focusing contenteditable nodes
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Notify parent on change
  useEffect(() => {
    onChange(blocks);
  }, [blocks]);

  // Focus block when ID changes
  useEffect(() => {
    if (focusBlockId) {
      const el = blockRefs.current[focusBlockId];
      if (el) {
        el.focus();
        // Move caret to end of block content
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false); // collapse to end
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setFocusBlockId(null);
    }
  }, [focusBlockId]);

  // Inline formatting selection detection
  const handleEditorSelectionChange = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setShowToolbar(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    
    // Position floating toolbar above selection relative to container coordinates
    setToolbarCoords({
      top: rect.top - containerRect.top - 48,
      left: rect.left - containerRect.left + (rect.width / 2) - 160
    });
    setShowToolbar(true);
  };

  useEffect(() => {
    document.addEventListener("selectionchange", handleEditorSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleEditorSelectionChange);
    };
  }, []);

  // Modify block content by index
  const updateBlockContent = (id: string, newContent: string) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content: newContent } : b));

    // Check if user typed '/' to trigger formatting options popover
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = newContent;
    const text = tempDiv.innerText || tempDiv.textContent || "";
    
    // Match '/' followed by characters at the end of the text
    const match = text.match(/\/([^\/\s]*)$/);
    if (match) {
      const query = match[1];
      setSlashQuery(query);
      setActiveMenuBlockId(id);
    } else {
      if (activeMenuBlockId === id) {
        setActiveMenuBlockId(null);
        setSlashQuery("");
      }
    }
  };

  const updateBannerStyle = (id: string, color: string, variant: 'light' | 'saturated') => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, bannerColor: color as any, bannerVariant: variant } : b));
  };

  // Insert block below current
  const insertBlockBelow = (currentId: string, type: EditorBlock["type"] = "paragraph", props = {}) => {
    const idx = blocks.findIndex(b => b.id === currentId);
    const newBlock: EditorBlock = {
      id: `b-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type,
      content: "",
      ...props
    };

    setBlocks(prev => {
      const copy = [...prev];
      copy.splice(idx + 1, 0, newBlock);
      return copy;
    });

    setFocusBlockId(newBlock.id);
  };

  // Delete block and shift focus
  const deleteBlock = (id: string) => {
    if (blocks.length <= 1) {
      // Don't delete last remaining block, just clear it
      setBlocks([{ id: "b-1", type: "paragraph", content: "" }]);
      setFocusBlockId("b-1");
      return;
    }

    const idx = blocks.findIndex(b => b.id === id);
    const focusId = idx > 0 ? blocks[idx - 1].id : blocks[idx + 1].id;

    setBlocks(prev => prev.filter(b => b.id !== id));
    setFocusBlockId(focusId);
    setActiveMenuBlockId(null);
  };

  // Convert block type
  const convertBlockType = (id: string, type: EditorBlock["type"] | "delete", extra = {}) => {
    if (type === "delete") {
      deleteBlock(id);
      setActiveMenuBlockId(null);
      setSlashQuery("");
      setSelectedMenuIndex(0);
      return;
    }

    setBlocks(prev => prev.map(b => {
      if (b.id === id) {
        // Strip out the '/' character and query that triggered the menu (e.g. "/heading")
        let cleanContent = b.content;
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = cleanContent;
        let text = tempDiv.innerText || tempDiv.textContent || "";
        const match = text.match(/\/([^\/\s]*)$/);
        if (match) {
          const index = text.lastIndexOf(match[0]);
          if (index !== -1) {
            text = text.slice(0, index);
          }
          tempDiv.innerText = text;
          cleanContent = tempDiv.innerHTML;
        }
        return { ...b, type, content: cleanContent, ...extra };
      }
      return b;
    }));
    setActiveMenuBlockId(null);
    setSlashQuery("");
    setSelectedMenuIndex(0);
    setFocusBlockId(id);
  };

  // Key Event Handlers (Enter to split, Backspace to merge/convert)
  const handleBlockKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, block: EditorBlock, idx: number) => {
    // Intercept keyboard events if the slash command menu is open
    if (activeMenuBlockId === block.id && filteredOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMenuIndex(prev => (prev + 1) % filteredOptions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMenuIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const selectedOption = filteredOptions[selectedMenuIndex];
        if (selectedOption) {
          convertBlockType(block.id, selectedOption.type, selectedOption.extra);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setActiveMenuBlockId(null);
        setSlashQuery("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // If code block, enter just inserts a newline in the editor
      if (block.type === "code") {
        document.execCommand("insertHTML", false, "\n");
        return;
      }
      insertBlockBelow(block.id, "paragraph");
    }

    if (e.key === "Backspace") {
      const el = blockRefs.current[block.id];
      const cursorAtStart = window.getSelection()?.anchorOffset === 0;

      // If block text is empty, convert block back to paragraph first or merge
      if (el && (el.innerText.trim() === "" || cursorAtStart)) {
        e.preventDefault();
        
        if (block.type !== "paragraph") {
          // Convert to paragraph first
          convertBlockType(block.id, "paragraph");
        } else if (idx > 0) {
          // Merge with previous block
          const prevBlock = blocks[idx - 1];
          const prevContent = prevBlock.content;
          const mergedContent = prevContent + block.content;
          
          updateBlockContent(prevBlock.id, mergedContent);
          
          // Delete current block
          setBlocks(prev => prev.filter(b => b.id !== block.id));
          setFocusBlockId(prevBlock.id);
        }
      }
    }

    // Arrow keys traversal
    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      setFocusBlockId(blocks[idx - 1].id);
    }
    if (e.key === "ArrowDown" && idx < blocks.length - 1) {
      e.preventDefault();
      setFocusBlockId(blocks[idx + 1].id);
    }
  };

  // Inline formatting helper
  const applyInlineStyle = (command: string, val: string = "") => {
    document.execCommand(command, false, val);
    
    // Sync active block HTML with state
    const activeEl = document.activeElement as HTMLDivElement;
    if (activeEl) {
      const blockId = Object.keys(blockRefs.current).find(key => blockRefs.current[key] === activeEl);
      if (blockId) {
        updateBlockContent(blockId, activeEl.innerHTML);
      }
    }

    handleEditorSelectionChange();
  };

  const applyCustomSpan = (className: string) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const span = document.createElement("span");
      span.className = className;
      
      try {
        range.surroundContents(span);
      } catch (err) {
        // Fallback insertion
        span.innerText = range.toString();
        range.deleteContents();
        range.insertNode(span);
      }

      // Sync active block HTML with state
      const activeEl = document.activeElement as HTMLDivElement;
      if (activeEl) {
        const blockId = Object.keys(blockRefs.current).find(key => blockRefs.current[key] === activeEl);
        if (blockId) {
          updateBlockContent(blockId, activeEl.innerHTML);
        }
      }
    }
  };

  const getSequentialNumber = (blockId: string) => {
    let count = 0;
    for (const b of blocks) {
      if (b.type === "number") {
        count++;
        if (b.id === blockId) return count;
      } else {
        // Reset count if non-sequential list breaks the flow
        // (Optional: standard behavior is to reset when non-number is encountered)
      }
    }
    return count;
  };

    return (
    <div ref={containerRef} className="relative w-full select-text bg-transparent border-none shadow-none p-0 m-0">
      
      {/* FLOATING TEXT SELECTION FORMATTING BAR */}
      {showToolbar && (
        <div 
          style={{ top: toolbarCoords.top, left: toolbarCoords.left }}
          className="absolute z-[999] flex items-center gap-1.5 bg-white border border-slate-250 text-slate-700 rounded-2xl px-3 py-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          onMouseDown={(e) => e.preventDefault()} // prevent loss of selection focus
        >
          {/* Style Controls */}
          <button 
            onClick={() => applyInlineStyle("bold")}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer animate-none"
            title={t("Bold", "Tučné", "Félkövér")}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button 
            onClick={() => applyInlineStyle("italic")}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer animate-none"
            title={t("Italic", "Kurzíva", "Dőlt")}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button 
            onClick={() => applyInlineStyle("underline")}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer animate-none"
            title={t("Underline", "Podčiarknuté", "Aláhúzott")}
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
          <button 
            onClick={() => applyInlineStyle("strikeThrough")}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer animate-none"
            title={t("Strikethrough", "Prečiarknuté", "Áthúzott")}
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </button>
          
          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Inline Code */}
          <button 
            onClick={() => applyCustomSpan("bg-slate-100 text-pink-600 px-1 py-0.5 rounded font-mono text-xs")}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer animate-none"
            title={t("Code tag", "Značka kódu", "Kód címke")}
          >
            <Code className="h-3.5 w-3.5" />
          </button>

          {/* Text Color - Quick Palette dropdown */}
          <div className="relative group">
            <button 
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer animate-none"
              title={t("Text Color", "Farba textu", "Szövegszín")}
            >
              <Palette className="h-3.5 w-3.5" />
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full pb-2 hidden group-hover:block z-50">
              <div className="flex bg-white border border-slate-200 p-2 rounded-xl gap-1.5 shadow-xl">
                <button onClick={() => applyInlineStyle("foreColor", "#ef4444")} className="h-4 w-4 rounded-full bg-red-500 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("foreColor", "#eab308")} className="h-4 w-4 rounded-full bg-yellow-500 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("foreColor", "#22c55e")} className="h-4 w-4 rounded-full bg-green-500 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("foreColor", "#3b82f6")} className="h-4 w-4 rounded-full bg-blue-500 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("foreColor", "#6366f1")} className="h-4 w-4 rounded-full bg-indigo-500 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("foreColor", "#0f172a")} className="h-4 w-4 rounded-full bg-slate-950 border border-slate-200 hover:scale-110 transition-transform cursor-pointer" />
              </div>
            </div>
          </div>

          {/* Text Highlight / Highlighter - Quick Palette dropdown */}
          <div className="relative group">
            <button 
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer animate-none"
              title={t("Highlight Color", "Farba zvýraznenia", "Kiemelés színe")}
            >
              <Highlighter className="h-3.5 w-3.5" />
            </button>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full pb-2 hidden group-hover:block z-50">
              <div className="flex bg-white border border-slate-200 p-2 rounded-xl gap-1.5 shadow-xl">
                <button onClick={() => applyInlineStyle("hiliteColor", "#fef08a")} className="h-4 w-4 rounded-full bg-yellow-200 border border-yellow-300 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("hiliteColor", "#bbf7d0")} className="h-4 w-4 rounded-full bg-green-200 border border-green-300 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("hiliteColor", "#bfdbfe")} className="h-4 w-4 rounded-full bg-blue-200 border border-blue-300 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("hiliteColor", "#fbcfe8")} className="h-4 w-4 rounded-full bg-pink-200 border border-pink-300 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("hiliteColor", "#ddd6fe")} className="h-4 w-4 rounded-full bg-purple-200 border border-purple-300 hover:scale-110 transition-transform cursor-pointer" />
                <button onClick={() => applyInlineStyle("hiliteColor", "transparent")} className="h-4 w-4 rounded-full bg-white border border-slate-300 hover:scale-110 transition-transform cursor-pointer flex items-center justify-center text-[10px] text-slate-450 font-bold font-sans">✕</button>
              </div>
            </div>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 mx-1" />

          {/* Link Insertion */}
          <button 
            onClick={() => {
              const url = prompt(t("Enter URL link:", "Zadajte URL odkaz:", "Adja meg az URL hivatkozást:"));
              if (url) applyInlineStyle("createLink", url);
            }}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer animate-none"
            title={t("Insert Link", "Vložiť odkaz", "Hivatkozás beszúrása")}
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* RENDER BLOCKS VERTICAL LIST */}
      <div className="space-y-4">
        {blocks.map((block, idx) => {
          const isMenuOpen = activeMenuBlockId === block.id;
          const bannerInfo = block.type === "banner" ? getBannerStyles(block) : null;

          return (
            <div 
              key={block.id}
              className="group relative flex items-start gap-3 w-full"
            >
              
              {/* LEFT HOVER MENUS CONTAINER */}
              <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity z-10 duration-200">
                <button
                  type="button"
                  onClick={() => insertBlockBelow(block.id, "paragraph")}
                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
                  title={t("Insert block below", "Vložiť blok nižšie", "Blokk beszúrása alá")}
                >
                  <Plus className="h-4 w-4" />
                </button>
                 <button
                  type="button"
                  onClick={() => {
                    setActiveMenuBlockId(isMenuOpen ? null : block.id);
                  }}
                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
                  title={t("Block settings & formats", "Nastavenia a formáty bloku", "Blokk beállításai és formátumai")}
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              </div>

              {/* BLOCK TYPE RENDERING STRUCTURE */}
              <div className="flex-1 w-full min-w-0 flex items-start gap-3">
                {/* 1. Checklist block */}
                {block.type === "todo" && (
                  <div className="flex items-center pt-1.5 shrink-0 select-none">
                    <input 
                      type="checkbox"
                      checked={block.checked || false}
                      onChange={() => {
                        setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, checked: !b.checked } : b));
                      }}
                      className="h-4.5 w-4.5 text-slate-900 border-slate-300 rounded focus:ring-slate-900 cursor-pointer"
                    />
                  </div>
                )}

                {/* 2. Bullet list block */}
                {block.type === "bullet" && (
                  <div className="pt-2.5 shrink-0 select-none">
                    <span className="h-2 w-2 rounded-full bg-slate-900 block" />
                  </div>
                )}

                {/* 3. Numbered list block */}
                {block.type === "number" && (
                  <div className="pt-1 select-none text-xs font-black text-slate-400 w-5 shrink-0 text-right pr-1 font-heading">
                    {getSequentialNumber(block.id)}.
                  </div>
                )}

                {/* 4. Toggle list block */}
                {block.type === "toggle" && (
                  <button
                    type="button"
                    onClick={() => {
                      setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, toggled: !b.toggled } : b));
                    }}
                    className="pt-1.5 text-slate-400 hover:text-slate-700 shrink-0 select-none cursor-pointer transition-transform"
                    style={{ transform: block.toggled ? "rotate(90deg)" : "rotate(0deg)" }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}

                {/* 5. Banner block icon wrapper */}
                {block.type === "banner" && bannerInfo && (
                  <div className="pt-2.5 shrink-0 select-none">
                    {getBannerIcon(bannerInfo.color, bannerInfo.variant)}
                  </div>
                )}

                {/* 6. Code block language header */}
                {block.type === "code" && (
                  <div className="pt-1.5 shrink-0 select-none">
                    <Terminal className="h-4.5 w-4.5 text-slate-400" />
                  </div>
                )}

                {/* 7. Quote block bar indicator */}
                {block.type === "quote" && (
                  <div className="w-1 self-stretch bg-indigo-500 rounded-full shrink-0 select-none" />
                )}

                {/* EDITABLE WRAPPER FRAME */}
                <div 
                  className="flex-1 w-full min-w-0 relative group/banner"
                >
                  <EditableBlock
                    innerRef={(el) => { blockRefs.current[block.id] = el; }}
                    content={block.content}
                    onChange={(html) => updateBlockContent(block.id, html)}
                    onKeyDown={(e) => handleBlockKeyDown(e, block, idx)}
                    onBlur={(e) => updateBlockContent(block.id, e.currentTarget.innerHTML)}
                    placeholder={
                      block.type === "paragraph"
                        ? t("Write meeting notes here... (type '/' for commands)", "Napíšte sem poznámky... (napíšte '/' pre príkazy)", "Írja ide a jegyzeteket... (parancsokhoz írjon '/' jelet)")
                        : t("Write block text...", "Napíšte text...", "Írja be a blokk szövegét...")
                    }
                    className={cn(
                      "outline-none text-slate-800 transition-all w-full leading-relaxed select-text py-1 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-350 empty:before:pointer-events-none",
                      block.type === "paragraph" && "text-sm",
                      block.type === "h1" && "text-2xl font-heading font-extrabold text-slate-900 pt-3 pb-1 tracking-tight",
                      block.type === "h2" && "text-xl font-heading font-extrabold text-slate-900 pt-2 pb-1 tracking-tight",
                      block.type === "h3" && "text-lg font-heading font-extrabold text-slate-900 pt-1.5 pb-0.5 tracking-tight",
                      block.type === "h4" && "text-base font-heading font-bold text-slate-800 pt-1 pb-0.5",
                      block.type === "todo" && cn("text-sm", block.checked && "line-through text-slate-400 font-medium"),
                      block.type === "bullet" && "text-sm",
                      block.type === "number" && "text-sm",
                      block.type === "toggle" && "text-sm font-semibold text-slate-800",
                      block.type === "banner" && bannerInfo && cn(
                        "text-xs font-semibold p-3.5 pr-10 rounded-2xl border w-full relative",
                        bannerInfo.classes
                      ),
                      block.type === "code" && "font-mono text-xs bg-slate-900 text-slate-200 p-4 rounded-2xl whitespace-pre overflow-x-auto border border-slate-800 w-full",
                      block.type === "quote" && "italic pl-3 text-sm text-slate-600 border-l-0 py-2 bg-slate-50/50 rounded-r-xl",
                      block.type === "pullquote" && "text-center py-6 px-4 text-base font-heading font-bold text-slate-700 italic border-y border-slate-100 max-w-lg mx-auto"
                    )}
                    style={{ 
                      textAlign: block.align || "left",
                      minHeight: block.type === "code" ? "60px" : "24px"
                    }}
                  />

                  {/* Banner color options popup on top right (visible on hover) */}
                  {block.type === "banner" && bannerInfo && (
                    <div className="absolute right-2 top-1.5 z-30 opacity-0 group-hover/banner:opacity-100 transition-opacity flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-md">
                      <div className="relative group/palette">
                        <button
                          type="button"
                          className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                          title={t("Banner style options", "Možnosti štýlu panela", "Banner stílus beállításai")}
                        >
                          <Palette className="h-3.5 w-3.5" />
                        </button>
                        {/* 14 colors dropdown panel */}
                        <div className="absolute right-0 top-full mt-1.5 pb-2 hidden group-hover/palette:block z-40">
                          <div className="bg-white border border-slate-200 p-2.5 rounded-xl shadow-xl space-y-2.5 w-[210px] select-none text-left">
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                              {t("Light variants", "Svetlé varianty", "Világos változatok")}
                            </div>
                            <div className="grid grid-cols-7 gap-1.5">
                              {BANNER_COLORS.map(c => {
                                const isSelected = bannerInfo.color === c && bannerInfo.variant === "light";
                                return (
                                  <button
                                    key={`light-${c}`}
                                    type="button"
                                    onClick={() => updateBannerStyle(block.id, c, "light")}
                                    className={cn(
                                      "h-5.5 w-5.5 rounded-full cursor-pointer transition-transform hover:scale-115 border",
                                      BANNER_THEMES[c].previewLight,
                                      isSelected ? "ring-2 ring-slate-800 ring-offset-1" : "border-slate-200/50"
                                    )}
                                    title={`${t("Light", "Svetlá", "Világos")} ${c}`}
                                  />
                                );
                              })}
                            </div>
                            
                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider pt-1 border-t border-slate-100">
                              {t("Saturated variants", "Sýte varianty", "Telített változatok")}
                            </div>
                            <div className="grid grid-cols-7 gap-1.5">
                              {BANNER_COLORS.map(c => {
                                const isSelected = bannerInfo.color === c && bannerInfo.variant === "saturated";
                                return (
                                  <button
                                    key={`sat-${c}`}
                                    type="button"
                                    onClick={() => updateBannerStyle(block.id, c, "saturated")}
                                    className={cn(
                                      "h-5.5 w-5.5 rounded-full cursor-pointer transition-transform hover:scale-115 border",
                                      BANNER_THEMES[c].previewSat,
                                      isSelected ? "ring-2 ring-slate-800 ring-offset-1" : "border-slate-250/20"
                                    )}
                                    title={`${t("Saturated", "Sýta", "Telített")} ${c}`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Toggle Content details render */}
                  {block.type === "toggle" && block.toggled && (
                    <div className="pl-6 border-l border-slate-100/80 mt-2 text-xs text-slate-500 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                      <EditableBlock
                        innerRef={() => {}}
                        content={block.toggleContent || ""}
                        onChange={(html) => {
                          setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, toggleContent: html } : b));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            document.execCommand("insertHTML", false, "\n");
                          }
                        }}
                        onBlur={(e) => {
                          setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, toggleContent: e.currentTarget.innerHTML } : b));
                        }}
                        className="outline-none min-h-[20px] text-slate-600 font-normal py-0.5 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-slate-350"
                        placeholder={getTranslation(systemLanguage, "editor.toggle_placeholder")}
                      />
                    </div>
                  )}

                  {/* INDIVIDUAL ROW DROPDOWN POPOVER TYPE SELECTION */}
                  {isMenuOpen && (
                    <div 
                      className="absolute left-0 top-full z-[9999] w-[460px] bg-white border border-slate-200 shadow-2xl rounded-2xl p-1 flex flex-col select-none animate-in fade-in slide-in-from-top-2 duration-150 mt-1"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div className="grid grid-cols-2 gap-4 divide-x divide-slate-100 p-2.5">
                        {/* Basic elements column */}
                        <div className="space-y-0.5 pr-2">
                          <div className="px-2.5 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 border-b border-slate-100/50 pb-1">
                            {t("Basic Elements", "Základné prvky", "Alapelemek")}
                          </div>
                          {basicFiltered.length === 0 ? (
                            <div className="text-[10px] text-slate-400 italic px-2.5 py-1.5">{t("No matches", "Žiadne zhody", "Nincs találat")}</div>
                          ) : (
                            basicFiltered.map(opt => {
                              const globalIdx = filteredOptions.findIndex(o => o.id === opt.id);
                              const isSelected = globalIdx === selectedMenuIndex;
                              const Icon = opt.icon;
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => convertBlockType(block.id, opt.type, opt.extra)}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs font-semibold cursor-pointer transition-colors",
                                    isSelected ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                                  )}
                                >
                                  <Icon className={cn("h-3.5 w-3.5", isSelected ? "text-white" : "text-slate-400")} />
                                  {opt.label}
                                </button>
                              );
                            })
                          )}
                        </div>
                        
                        {/* Advanced elements column */}
                        <div className="space-y-0.5 pl-3">
                          <div className="px-2.5 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 border-b border-slate-100/50 pb-1">
                            {t("Advanced Elements", "Pokročilé prvky", "Speciális elemek")}
                          </div>
                          {advancedFiltered.length === 0 ? (
                            <div className="text-[10px] text-slate-400 italic px-2.5 py-1.5">{t("No matches", "Žiadne zhody", "Nincs találat")}</div>
                          ) : (
                            advancedFiltered.map(opt => {
                              const globalIdx = filteredOptions.findIndex(o => o.id === opt.id);
                              const isSelected = globalIdx === selectedMenuIndex;
                              const Icon = opt.icon;
                              return (
                                <button
                                  key={opt.id}
                                  onClick={() => convertBlockType(block.id, opt.type, opt.extra)}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs font-semibold cursor-pointer transition-colors",
                                    isSelected ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
                                  )}
                                >
                                  <Icon className={cn("h-3.5 w-3.5", isSelected ? "text-white" : "text-slate-400")} />
                                  {opt.label}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>



            </div>
          );
        })}
      </div>

      {/* Click outside target to close dropdowns */}
      {isMenuOpenAnywhere() && (
        <div 
          className="fixed inset-0 z-[9990] bg-transparent"
          onClick={() => setActiveMenuBlockId(null)}
        />
      )}

    </div>
  );

  function isMenuOpenAnywhere() {
    return activeMenuBlockId !== null;
  }
};

export default BlockEditor;
