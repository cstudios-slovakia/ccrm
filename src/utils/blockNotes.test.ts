import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blockNotesToPlainText,
  getBannerStyles,
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
