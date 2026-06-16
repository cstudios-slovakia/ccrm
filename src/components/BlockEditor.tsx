import React, { useEffect, useRef } from "react";

/**
 * A lightweight block-based notes editor used by the Meeting Room view.
 *
 * Each block is an independently editable line/paragraph stored as an HTML
 * string in `content`. Blocks are uncontrolled contentEditable elements (the
 * DOM is the source of truth while editing) so the caret never jumps; changes
 * are reported upward via `onChange`.
 */
export interface EditorBlock {
  id: string;
  type: string; // "paragraph" | "heading" | "bullet"
  content: string; // HTML string
}

interface BlockEditorProps {
  initialBlocks: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
  systemLanguage?: "en" | "sk" | "hu";
}

const placeholderFor = (lang?: string) =>
  lang === "sk"
    ? "Začnite písať poznámky…"
    : lang === "hu"
    ? "Kezdjen el írni…"
    : "Start typing your notes…";

const newId = () => `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const blockClass = (type: string) => {
  switch (type) {
    case "heading":
      return "text-base font-black text-slate-900";
    case "bullet":
      return "text-sm text-slate-700 list-item ml-5";
    default:
      return "text-sm text-slate-700";
  }
};

interface BlockProps {
  block: EditorBlock;
  placeholder: string;
  autoFocus: boolean;
  onInput: (content: string) => void;
  onEnter: (content: string) => void;
  onBackspaceEmpty: () => void;
}

const Block: React.FC<BlockProps> = ({ block, placeholder, autoFocus, onInput, onEnter, onBackspaceEmpty }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Seed the DOM once on mount; thereafter the element is uncontrolled.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== block.content) {
      ref.current.innerHTML = block.content || "";
    }
    if (autoFocus && ref.current) {
      ref.current.focus();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      data-placeholder={placeholder}
      className={`block-editor-line outline-none py-1 min-h-[1.6rem] focus:bg-slate-50/60 rounded px-1 transition-colors ${blockClass(block.type)}`}
      onInput={() => onInput(ref.current?.innerHTML ?? "")}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onEnter(ref.current?.innerHTML ?? "");
        } else if (e.key === "Backspace") {
          const text = ref.current?.textContent ?? "";
          if (text === "") {
            e.preventDefault();
            onBackspaceEmpty();
          }
        }
      }}
    />
  );
};

export const BlockEditor: React.FC<BlockEditorProps> = ({ initialBlocks, onChange, systemLanguage }) => {
  // Internal mutable list. We render with a stable key per block so existing
  // blocks are never re-seeded (caret stays put); only added/removed blocks
  // mount/unmount.
  const blocksRef = useRef<EditorBlock[]>(
    initialBlocks && initialBlocks.length
      ? initialBlocks.map((b) => ({ ...b }))
      : [{ id: newId(), type: "paragraph", content: "" }]
  );
  // Force re-render when the block list structure changes.
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const autoFocusId = useRef<string | null>(null);

  const emit = () => onChange(blocksRef.current.map((b) => ({ ...b })));

  const updateContent = (id: string, content: string) => {
    const b = blocksRef.current.find((x) => x.id === id);
    if (b) {
      b.content = content;
      emit();
    }
  };

  const addAfter = (id: string, currentContent: string) => {
    const idx = blocksRef.current.findIndex((x) => x.id === id);
    if (idx === -1) return;
    blocksRef.current[idx].content = currentContent;
    const fresh: EditorBlock = { id: newId(), type: "paragraph", content: "" };
    blocksRef.current.splice(idx + 1, 0, fresh);
    autoFocusId.current = fresh.id;
    emit();
    force();
  };

  const removeBlock = (id: string) => {
    const idx = blocksRef.current.findIndex((x) => x.id === id);
    if (idx <= 0) return; // never remove the very first block
    blocksRef.current.splice(idx, 1);
    autoFocusId.current = blocksRef.current[idx - 1]?.id ?? null;
    emit();
    force();
  };

  return (
    <div className="space-y-0.5">
      <style>{`
        .block-editor-line:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
      `}</style>
      {blocksRef.current.map((block) => (
        <Block
          key={block.id}
          block={block}
          placeholder={placeholderFor(systemLanguage)}
          autoFocus={autoFocusId.current === block.id}
          onInput={(content) => updateContent(block.id, content)}
          onEnter={(content) => addAfter(block.id, content)}
          onBackspaceEmpty={() => removeBlock(block.id)}
        />
      ))}
    </div>
  );
};

export default BlockEditor;
