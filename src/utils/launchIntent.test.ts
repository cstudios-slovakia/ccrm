import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SHARED_TASK_LENGTH,
  buildNewTaskHash,
  composeSharedText,
  hasLaunchIntent,
  parseLaunchIntent,
  shareTargetRedirect,
  stripLaunchIntent,
} from "./launchIntent.ts";

test("newTask: absent, empty (blank form) and filled are three different things", () => {
  assert.deepEqual(parseLaunchIntent("#tasks"), { newTask: null, voice: false });
  assert.deepEqual(parseLaunchIntent("#tasks?newTask="), { newTask: "", voice: false });
  assert.deepEqual(parseLaunchIntent("#tasks?newTask=Call%20Silvia%20%26%20Peter"), {
    newTask: "Call Silvia & Peter",
    voice: false,
  });
  assert.equal(hasLaunchIntent("#tasks?newTask="), true);
  assert.equal(hasLaunchIntent("#tasks"), false);
});

test("newTask: a plus is a space, an encoded plus stays a plus, text is trimmed", () => {
  assert.equal(parseLaunchIntent("#tasks?newTask=a+b").newTask, "a b");
  assert.equal(parseLaunchIntent("#tasks?newTask=1%2B1").newTask, "1+1");
  assert.equal(parseLaunchIntent("#tasks?newTask=%20%20hi%20").newTask, "hi");
});

test("voice: 1 and true arm it, 0 / false / absent do not", () => {
  assert.equal(parseLaunchIntent("#tasks?voice=1").voice, true);
  assert.equal(parseLaunchIntent("#tasks?voice=true").voice, true);
  assert.equal(parseLaunchIntent("#tasks?voice=").voice, true);
  assert.equal(parseLaunchIntent("#tasks?voice=0").voice, false);
  assert.equal(parseLaunchIntent("#tasks?voice=false").voice, false);
  assert.equal(parseLaunchIntent("#tasks").voice, false);
  assert.equal(parseLaunchIntent("").voice, false);
});

test("both params can arrive together, with or without the leading #", () => {
  assert.deepEqual(parseLaunchIntent("tasks?voice=1&newTask=x"), { newTask: "x", voice: true });
});

test("stripping removes only the launch params and keeps the route and the rest", () => {
  assert.equal(stripLaunchIntent("#tasks?newTask=hello%20world"), "#tasks");
  assert.equal(stripLaunchIntent("#tasks?voice=1"), "#tasks");
  assert.equal(stripLaunchIntent("#tasks?embed=tasks&newTask=x&voice=1"), "#tasks?embed=tasks");
  assert.equal(stripLaunchIntent("#tasks"), "#tasks");
  assert.equal(stripLaunchIntent("#projects/p1?tab=files"), "#projects/p1?tab=files");
  assert.equal(hasLaunchIntent(stripLaunchIntent("#tasks?newTask=x&voice=1")), false);
});

test("compose: title, text and link become one line; a link already in the text is not repeated", () => {
  assert.equal(
    composeSharedText({ title: "Offer draft", text: "see below", url: "https://x.sk/a" }),
    "Offer draft — see below https://x.sk/a",
  );
  assert.equal(
    composeSharedText({ text: "Read https://x.sk/a today", url: "https://x.sk/a" }),
    "Read https://x.sk/a today",
  );
  assert.equal(composeSharedText({ title: "Same", text: "Same" }), "Same");
  assert.equal(composeSharedText({ url: "https://x.sk" }), "https://x.sk");
  assert.equal(composeSharedText({}), "");
});

test("compose: newlines never split a share into several tasks", () => {
  const out = composeSharedText({ text: "line one\n\nline two\r\n  line three" });
  assert.equal(out, "line one line two line three");
  assert.equal(out.includes("\n"), false);
});

test("compose: a very long share is cut to the limit but its link survives intact", () => {
  const url = "https://example.com/some/long/path?x=1";
  const out = composeSharedText({ text: "word ".repeat(400), url });
  assert.ok(out.length <= MAX_SHARED_TASK_LENGTH + 2, `length ${out.length}`);
  assert.ok(out.endsWith(url));
  assert.ok(out.includes("… "));
  const noUrl = composeSharedText({ text: "x".repeat(2000) });
  assert.equal(noUrl.length, MAX_SHARED_TASK_LENGTH);
  assert.ok(noUrl.endsWith("…"));
});

test("share target: the query becomes #tasks?newTask=… and the share params leave the query", () => {
  const r = shareTargetRedirect("?ccrm_share_title=Hi&ccrm_share_text=there&ccrm_share_url=https%3A%2F%2Fx.sk", "");
  assert.ok(r);
  assert.equal(r.search, "");
  assert.equal(parseLaunchIntent(r.hash).newTask, "Hi — there https://x.sk");
  assert.ok(r.hash.startsWith("#tasks?newTask="));
});

test("share target: other query params survive, a plain load is not a share", () => {
  const r = shareTargetRedirect("?qa=2&ccrm_share_text=hello", "");
  assert.ok(r);
  assert.equal(r.search, "?qa=2");
  assert.equal(shareTargetRedirect("?qa=2", ""), null);
  assert.equal(shareTargetRedirect("", "#tasks"), null);
  // The plain names are not ours, so they are never mistaken for a share.
  assert.equal(shareTargetRedirect("?title=x&text=y&url=z", ""), null);
});

test("share target: an empty share still opens a blank create form", () => {
  const r = shareTargetRedirect("?ccrm_share_title=&ccrm_share_text=", "");
  assert.ok(r);
  assert.deepEqual(parseLaunchIntent(r.hash), { newTask: "", voice: false });
});

test("bookmarklet hash round-trips awkward text", () => {
  const text = 'Fix "quotes" & #tags / 100% ✓\nsecond line';
  const hash = buildNewTaskHash(text);
  assert.equal(parseLaunchIntent(hash).newTask, 'Fix "quotes" & #tags / 100% ✓ second line');
});

import vm from "node:vm";
import { buildBookmarklet } from "./launchIntent.ts";

const runBookmarklet = (page: { selection: string; title: string; href: string }, origin = "https://crm.example.sk") => {
  const opened: string[] = [];
  const href = buildBookmarklet(origin);
  assert.ok(href.startsWith("javascript:"));
  assert.equal(href.includes("\n"), false);
  const context = {
    window: {
      getSelection: () => ({ toString: () => page.selection }),
      open: (url: string) => opened.push(url),
    },
    location: { href: page.href },
    document: { title: page.title },
    encodeURIComponent,
  };
  vm.runInNewContext(href.slice("javascript:".length), context);
  assert.equal(opened.length, 1);
  return opened[0];
};

test("bookmarklet: selected text wins over the title and the page address is appended", () => {
  const url = runBookmarklet({ selection: "  Call  Silvia\n tomorrow ", title: "Inbox", href: "https://mail.example.com/x" });
  assert.ok(url.startsWith("https://crm.example.sk/#tasks?newTask="));
  assert.equal(parseLaunchIntent(url.slice(url.indexOf("#"))).newTask, "Call Silvia tomorrow https://mail.example.com/x");
});

test("bookmarklet: with nothing selected it falls back to the page title", () => {
  const url = runBookmarklet({ selection: "", title: "Offer — Novák Stavby", href: "https://x.sk/o/1" });
  assert.equal(parseLaunchIntent(url.slice(url.indexOf("#"))).newTask, "Offer — Novák Stavby https://x.sk/o/1");
});

test("bookmarklet: a huge selection is cut, the address stays whole", () => {
  const href = "https://x.sk/long/path?x=1";
  const url = runBookmarklet({ selection: "word ".repeat(500), title: "t", href });
  const text = parseLaunchIntent(url.slice(url.indexOf("#"))).newTask as string;
  assert.ok(text.endsWith(` ${href}`));
  assert.ok(text.length <= MAX_SHARED_TASK_LENGTH);
});

test("bookmarklet: a trailing slash on the origin does not double up", () => {
  const url = runBookmarklet({ selection: "x", title: "", href: "https://a.b" }, "https://crm.example.sk/");
  assert.ok(url.startsWith("https://crm.example.sk/#tasks?newTask="));
});
