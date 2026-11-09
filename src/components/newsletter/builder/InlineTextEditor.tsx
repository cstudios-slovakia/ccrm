import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Braces, Italic, Link2, List, ListOrdered, RemoveFormatting, Underline } from 'lucide-react';
import { ColorPicker } from '../../ui/ColorPicker';
import type { HeadingBlock, TextBlock } from './types.ts';
import { useBuilder } from './builderContext.ts';
import { MERGE_TAGS, htmlEscape } from './mergeTags.ts';
import { headingStyle, reactStyle, richEditorCss, textBlockStyle, STYLE_DEFAULTS } from './styles.ts';
import { cleanEditedHtml, cleanPastedHtml, plainTextToRich } from './richText.ts';
import { CHROME } from './canvasChrome.tsx';

type Popover = 'link' | 'merge' | null;

const ToolButton: React.FC<{ title: string; onClick: () => void; active?: boolean; children: React.ReactNode }> = ({ title, onClick, active, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md"
    style={{ color: CHROME.ink, background: active ? '#e0e7ff' : 'transparent' }}
  >
    {children}
  </button>
);

const Divider = () => <span className="mx-0.5 h-4 w-px" style={{ background: CHROME.line }} />;

/**
 * Inline editing of a text or heading block: a contenteditable plus a floating bar.
 * The DOM is the source of truth while typing: its HTML is cleaned to the `newsletter`
 * profile and emitted on every input; the editor's innerHTML is only replaced when the
 * block changes from outside (undo, redo).
 */
export const InlineTextEditor: React.FC<{ block: TextBlock | HeadingBlock; onExit: () => void }> = ({ block, onExit }) => {
  const { t, theme, act } = useBuilder();
  const inline = block.type === 'heading';
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [popover, setPopover] = useState<Popover>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [textColor, setTextColor] = useState(theme.textColor);

  const initial = () => (inline ? block.html : block.html.trim() ? block.html : '<p><br></p>');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = initial();
    lastEmitted.current = block.html;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.selectAllChildren(el);
      sel.collapseToEnd();
    }
    if (!inline) document.execCommand('defaultParagraphSeparator', false, 'p');
    // Once per editing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The block changed from outside the editor (undo, redo, a reload): show it.
  useEffect(() => {
    const el = ref.current;
    if (el && block.html !== lastEmitted.current) {
      el.innerHTML = initial();
      lastEmitted.current = block.html;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.html]);

  // Remember the selection while it is inside the editor: opening a popover or the colour
  // picker moves focus away, and the command must apply to what was selected.
  useEffect(() => {
    const onSelectionChange = () => {
      const el = ref.current;
      const sel = window.getSelection();
      if (el && sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        savedRange.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = cleanEditedHtml(el.innerHTML, inline);
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    act.patchBlock(block.id, { html }, `edit:${block.id}`);
  }, [act, block.id, inline]);

  const restore = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const exec = (command: string, value?: string) => {
    restore();
    document.execCommand(command, false, value);
    emit();
  };

  const currentAnchor = (): HTMLAnchorElement | null => {
    const node = savedRange.current?.startContainer;
    const el = node && node.nodeType === 3 ? node.parentElement : (node as Element | null | undefined);
    return (el?.closest?.('a') as HTMLAnchorElement | null) ?? null;
  };

  const openLink = () => {
    setLinkUrl(currentAnchor()?.getAttribute('href') ?? 'https://');
    setPopover(popover === 'link' ? null : 'link');
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    setPopover(null);
    if (!url || url === 'https://') return;
    restore();
    if (savedRange.current && savedRange.current.collapsed && !currentAnchor()) {
      document.execCommand('insertHTML', false, `<a href="${htmlEscape(url)}">${htmlEscape(url)}</a>`);
    } else {
      document.execCommand('createLink', false, url);
    }
    emit();
  };

  const removeLink = () => {
    setPopover(null);
    exec('unlink');
  };

  const insertTag = (tag: string) => {
    setPopover(null);
    exec('insertText', `{{${tag}}}`);
  };

  const applyColor = (hex: string) => {
    setTextColor(hex);
    restore();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, hex);
    document.execCommand('styleWithCSS', false, 'false');
    emit();
  };

  const clearFormatting = () => {
    restore();
    document.execCommand('removeFormat');
    document.execCommand('unlink');
    emit();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onExit();
    } else if (e.key === 'Enter' && inline) {
      // A heading is one block of inline text: Enter is a line break, never a paragraph.
      e.preventDefault();
      document.execCommand('insertLineBreak');
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    const clean = html ? cleanPastedHtml(html, inline) : '';
    document.execCommand('insertHTML', false, clean || plainTextToRich(text, inline));
    emit();
  };

  const style = inline ? headingStyle(block, theme) : textBlockStyle(block, theme);
  const tags = MERGE_TAGS;
  const linkTags = ['unsubscribe_url', 'view_online_url'];

  return (
    <div className="relative">
      <style>{richEditorCss('.nl-edit', theme)}</style>
      <div
        className="absolute left-0 top-0 z-50 flex -translate-y-full items-center rounded-md px-0.5 shadow-md"
        style={{ background: CHROME.white, border: `1px solid ${CHROME.line}` }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => {
          // Buttons must not take the focus (and with it the selection) away from the text.
          const tag = (e.target as HTMLElement).tagName;
          if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') e.preventDefault();
        }}
      >
        <ToolButton title={t('Bold', 'Tučné', 'Félkövér')} onClick={() => exec('bold')}>
          <Bold className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton title={t('Italic', 'Kurzíva', 'Dőlt')} onClick={() => exec('italic')}>
          <Italic className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton title={t('Underline', 'Podčiarknuté', 'Aláhúzott')} onClick={() => exec('underline')}>
          <Underline className="h-3.5 w-3.5" />
        </ToolButton>
        <Divider />
        <ToolButton title={t('Link', 'Odkaz', 'Hivatkozás')} onClick={openLink} active={popover === 'link'}>
          <Link2 className="h-3.5 w-3.5" />
        </ToolButton>
        {!inline && (
          <>
            <ToolButton title={t('Bulleted list', 'Odrážky', 'Felsorolás')} onClick={() => exec('insertUnorderedList')}>
              <List className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton title={t('Numbered list', 'Číslovaný zoznam', 'Számozott lista')} onClick={() => exec('insertOrderedList')}>
              <ListOrdered className="h-3.5 w-3.5" />
            </ToolButton>
          </>
        )}
        <span className="flex h-7 w-7 items-center justify-center">
          <ColorPicker value={textColor} fallback={theme.textColor} variant="ring" title={t('Text colour', 'Farba textu', 'Szövegszín')} onChange={applyColor} />
        </span>
        <ToolButton title={t('Clear formatting', 'Odstrániť formátovanie', 'Formázás törlése')} onClick={clearFormatting}>
          <RemoveFormatting className="h-3.5 w-3.5" />
        </ToolButton>
        <Divider />
        <ToolButton title={t('Insert merge tag', 'Vložiť pole', 'Címke beszúrása')} onClick={() => setPopover(popover === 'merge' ? null : 'merge')} active={popover === 'merge'}>
          <Braces className="h-3.5 w-3.5" />
        </ToolButton>

        {popover === 'link' && (
          <div className="absolute left-0 top-full z-50 mt-1 w-72 space-y-2 rounded-lg p-2.5 shadow-lg" style={{ background: CHROME.white, border: `1px solid ${CHROME.line}`, color: CHROME.ink }}>
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setPopover(null);
                  restore();
                }
              }}
              placeholder="https://… / {{unsubscribe_url}}"
              aria-label={t('Link address', 'Adresa odkazu', 'Hivatkozás címe')}
              className="w-full rounded-md px-2 py-1.5 text-ui"
              style={{ border: `1px solid ${CHROME.line}`, background: CHROME.white, color: CHROME.ink }}
            />
            <div className="flex flex-wrap gap-1">
              {linkTags.map((tag) => (
                <button key={tag} type="button" onClick={() => setLinkUrl(`{{${tag}}}`)} className="cursor-pointer rounded-md px-1.5 py-0.5 text-caption" style={{ background: '#eef2ff', color: CHROME.accent }}>
                  {`{{${tag}}}`}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={removeLink} className="cursor-pointer text-caption font-semibold" style={{ color: CHROME.danger }}>
                {t('Remove link', 'Odstrániť odkaz', 'Hivatkozás törlése')}
              </button>
              <button type="button" onClick={applyLink} className="cursor-pointer rounded-md px-3 py-1 text-ui font-semibold" style={{ background: CHROME.accent, color: CHROME.white }}>
                {t('Apply', 'Použiť', 'Alkalmaz')}
              </button>
            </div>
          </div>
        )}
        {popover === 'merge' && (
          <div className="absolute right-0 top-full z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg p-1 shadow-lg" style={{ background: CHROME.white, border: `1px solid ${CHROME.line}`, color: CHROME.ink }}>
            {tags.map((m) => (
              <button key={m.tag} type="button" onClick={() => insertTag(m.tag)} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-ui hover:bg-[#f1f5f9]">
                <span>{t(m.label.en, m.label.sk, m.label.hu)}</span>
                <code className="text-caption" style={{ color: CHROME.muted }}>{`{{${m.tag}}}`}</code>
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: `${STYLE_DEFAULTS.blockPadY}px 0` }}>
        <div
          ref={ref}
          className="nl-edit"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          role="textbox"
          aria-multiline={!inline}
          aria-label={inline ? t('Heading', 'Nadpis', 'Címsor') : t('Text', 'Text', 'Szöveg')}
          onInput={emit}
          onBlur={emit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          style={{ ...reactStyle(style), outline: 'none', minHeight: '1.5em', wordBreak: 'break-word' }}
        />
      </div>
    </div>
  );
};
