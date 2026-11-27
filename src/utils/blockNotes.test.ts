import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blockNotesToMarkdown,
  blockNotesToPlainText,
  blocksToMarkdown,
  exportMarkdownFilename,
  getBannerStyles,
  inlineHtmlToMarkdown,
  isSerializedBlockArray,
  parseNotesToBlocks,
  removeTagFromDescription,
  serializeBlocksToPlainText,
  serializeTaskDescription,
  type EditorBlock,
} from "./blockNotes.ts";

test("parseNotesToBlocks parses empty, plain-text, and serialized JSON notes", () => {
  assert.deepEqual(parseNotesToBlocks(""), [{ id: "b-1", type: "paragraph", content: "" }]);

  const plain = parseNotesToBlocks("Line 1 & <check>\nLine 2");
  assert.equal(plain.length, 2);
  assert.equal(plain[0].content, "Line 1 &amp; &lt;check&gt;");
  assert.equal(plain[1].content, "Line 2");

  const bracketedPlain = parseNotesToBlocks("[TCK-42] check logs");
  assert.equal(bracketedPlain.length, 1);
  assert.equal(bracketedPlain[0].type, "paragraph");
  assert.equal(bracketedPlain[0].content, "[TCK-42] check logs");

  const rich: EditorBlock[] = [
    { id: "b-1", type: "h1", content: "Spec" },
    { id: "b-2", type: "todo", content: "Verify mobile", checked: true },
  ];
  assert.deepEqual(parseNotesToBlocks(JSON.stringify(rich)), rich);
});

test("serializeTaskDescription returns empty string for blank editor, plain text for plain paragraphs, and JSON for rich blocks", () => {
  assert.equal(serializeTaskDescription([]), "");
  assert.equal(serializeTaskDescription([{ id: "b-1", type: "paragraph", content: "" }]), "");
  assert.equal(serializeTaskDescription([{ id: "b-1", type: "paragraph", content: "<br>" }]), "");

  assert.equal(
    serializeTaskDescription([
      { id: "b-1", type: "paragraph", content: "Call Silvia" },
      { id: "b-2", type: "paragraph", content: "Send contract" },
    ]),
    "Call Silvia\nSend contract",
  );

  const formatted: EditorBlock[] = [
    { id: "b-1", type: "paragraph", content: '<b>Urgent</b> <span style="color: #ef4444">#vip</span>' },
    { id: "b-2", type: "todo", content: "Attach PDF", checked: false },
  ];
  const saved = serializeTaskDescription(formatted);
  assert.equal(isSerializedBlockArray(saved), true);
  assert.deepEqual(JSON.parse(saved), formatted);
});

test("blockNotesToPlainText extracts visible text including toggles without exposing HTML or JSON keys", () => {
  const blocks: EditorBlock[] = [
    { id: "b-1", type: "h2", content: "Checklist" },
    { id: "b-2", type: "toggle", content: "Details #qa", toggled: true, toggleContent: '<b>Hidden</b> body' },
    { id: "b-3", type: "banner", content: '<span style="color: #ef4444">Red alert</span> #urgent', bannerType: "danger" },
  ];
  const serialized = JSON.stringify(blocks);
  const plain = blockNotesToPlainText(serialized);
  assert.equal(plain, "Checklist\nDetails #qa\nHidden body\nRed alert #urgent");
  assert.equal(plain.includes("ef4444"), false);
  assert.equal(serializeBlocksToPlainText(blocks), plain);
  assert.equal(blockNotesToPlainText("Plain note"), "Plain note");
});

test("removeTagFromDescription strips #tag from rich blocks without breaking HTML colors or JSON", () => {
  const blocks: EditorBlock[] = [
    { id: "b-1", type: "paragraph", content: '<span style="color: #ef4444">Check</span> #urgent task #urgent-2' },
    { id: "b-2", type: "todo", content: "Confirm #urgent", checked: false },
  ];
  const updated = removeTagFromDescription(JSON.stringify(blocks), "urgent");
  assert.equal(isSerializedBlockArray(updated), true);
  const parsed = JSON.parse(updated) as EditorBlock[];
  assert.equal(parsed[0].content, '<span style="color: #ef4444">Check</span> task #urgent-2');
  assert.equal(parsed[1].content, "Confirm");

  assert.equal(removeTagFromDescription("Call #urgent client", "urgent"), "Call client");
});

test("getBannerStyles resolves explicit color and fallback bannerType variants", () => {
  assert.equal(getBannerStyles({ bannerType: "warning" }).color, "yellow");
  assert.equal(getBannerStyles({ bannerType: "success" }).color, "green");
  assert.equal(getBannerStyles({ bannerType: "danger" }).color, "red");
  assert.equal(getBannerStyles({ bannerColor: "purple", bannerVariant: "saturated" }).color, "purple");
});

test("inlineHtmlToMarkdown converts formatting tags, code spans, links, and styles cleanly", () => {
  const sample =
    'Start <b>bold </b><i>italic</i> <s>old</s> <u>keep</u> <span class="bg-slate-100 font-mono">const a = 1</span> &amp; <a href="https://cstudios.sk/a(1)" target="_blank">Site</a> <span style="color: #ef4444">colored</span>';
  assert.equal(
    inlineHtmlToMarkdown(sample),
    "Start **bold** *italic* ~~old~~ <u>keep</u> `const a = 1` & [Site](https://cstudios.sk/a(1%29) colored",
  );
  assert.equal(inlineHtmlToMarkdown("<code>a `b` c</code>"), "``a `b` c``");
  assert.equal(inlineHtmlToMarkdown("<code>`edge`</code>"), "`` `edge` ``");
});

test("blocksToMarkdown exports all block types with tight list grouping", () => {
  const blocks: EditorBlock[] = [
    { id: "1", type: "h1", content: "Project Plan" },
    { id: "2", type: "paragraph", content: "Intro <strong>notes</strong>." },
    { id: "3", type: "todo", content: "Done item", checked: true },
    { id: "4", type: "todo", content: "Open item", checked: false },
    { id: "5", type: "bullet", content: "First" },
    { id: "6", type: "bullet", content: "Second" },
    { id: "7", type: "number", content: "Step A" },
    { id: "8", type: "number", content: "Step B" },
    { id: "9", type: "toggle", content: "FAQ", toggled: true, toggleContent: "Line 1<br>Line 2" },
    { id: "10", type: "banner", content: "Check DNS", bannerType: "warning" },
    { id: "11", type: "code", content: "npm run check\n# ok", codeLanguage: "bash" },
    { id: "12", type: "quote", content: "Quote line" },
    { id: "13", type: "pullquote", content: "Highlight" },
  ];

  const md = blocksToMarkdown(blocks);
  assert.equal(
    md,
    [
      "# Project Plan",
      "",
      "Intro **notes**.",
      "",
      "- [x] Done item",
      "- [ ] Open item",
      "",
      "- First",
      "- Second",
      "",
      "1. Step A",
      "2. Step B",
      "",
      "- **FAQ**\n  Line 1\n  Line 2",
      "",
      "> [!WARNING]\n> Check DNS",
      "",
      "```bash\nnpm run check\n# ok\n```",
      "",
      "> Quote line",
      "",
      "> *Highlight*",
    ].join("\n"),
  );
  assert.equal(blockNotesToMarkdown(JSON.stringify(blocks)), md);
  assert.equal(blockNotesToMarkdown("  Plain note  "), "Plain note");
});

test("exportMarkdownFilename generates sanitized .md slugs", () => {
  assert.equal(exportMarkdownFilename("Zavolať klientke Silvii (#58)"), "zavolat-klientke-silvii-58.md");
  assert.equal(exportMarkdownFilename(""), "notes.md");
  assert.equal(exportMarkdownFilename(null, "meeting-notes"), "meeting-notes.md");
});

test("serializeTaskDescription and blocksToMarkdown handle inline file blocks", () => {
  const blocks: EditorBlock[] = [
    { id: "1", type: "paragraph", content: "Attached assets" },
    {
      id: "2",
      type: "file",
      content: "",
      fileId: "f-img",
      fileName: "mockup.png",
      fileUrl: "api/task_files.php?action=download&id=f-img",
      fileMime: "image/png",
      fileSize: 2048,
      fileIsImage: true,
    },
    {
      id: "3",
      type: "file",
      content: "",
      fileId: "f-sql",
      fileName: "schema.sql",
      fileUrl: "api/task_files.php?action=download&id=f-sql",
      fileMime: "text/plain",
      fileSize: 512,
      fileIsImage: false,
    },
  ];

  const serialized = serializeTaskDescription(blocks);
  assert.equal(isSerializedBlockArray(serialized), true);
  assert.equal(serializeBlocksToPlainText(blocks), "Attached assets\nmockup.png\nschema.sql");
  assert.equal(
    blocksToMarkdown(blocks),
    [
      "Attached assets",
      "",
      "![mockup.png](api/task_files.php?action=download&id=f-img)",
      "",
      "[schema.sql](api/task_files.php?action=download&id=f-sql)",
    ].join("\n"),
  );
});

