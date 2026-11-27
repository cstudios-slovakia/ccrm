import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { demoSocialPackFor, getDemoSocialPosts } from "./socialPosts.ts";

const LANGS = ["sk", "hu", "en"] as const;
const here = dirname(fileURLToPath(import.meta.url));
const NOW = new Date(2026, 10, 3, 12, 0, 0); // 3 Nov 2026, local noon

describe("demo social posts", () => {
  it("has the same posts in every language: ids, platforms, statuses, days, times and numbers", () => {
    const strip = (lang: string) => demoSocialPackFor(lang).map(({ content, accountName, accountHandle, platformPostUrl, ...rest }) => rest);
    assert.deepEqual(strip("hu"), strip("sk"));
    assert.deepEqual(strip("en"), strip("sk"));
  });

  it("translates the text: no post is identical in two languages", () => {
    for (let i = 0; i < demoSocialPackFor("sk").length; i++) {
      const texts = LANGS.map((l) => demoSocialPackFor(l)[i].content);
      assert.equal(new Set(texts).size, 3, `post ${i + 1} is not translated`);
    }
  });

  it("falls back to English for any other language", () => {
    assert.equal(demoSocialPackFor("de"), demoSocialPackFor("en"));
  });

  it("dates published posts in the past, scheduled ones in the future, drafts without a date", () => {
    for (const lang of LANGS) {
      const posts = getDemoSocialPosts(lang, NOW);
      for (const p of posts) {
        if (p.status === "published") {
          assert.ok(p.publishedAt && new Date(p.publishedAt) < NOW, `${p.id} published in the past`);
          assert.equal(p.scheduledFor, undefined);
        } else if (p.status === "scheduled") {
          assert.ok(p.scheduledFor && new Date(p.scheduledFor) > NOW, `${p.id} scheduled in the future`);
          assert.equal(p.publishedAt, undefined);
        } else {
          assert.equal(p.publishedAt, undefined);
          assert.equal(p.scheduledFor, undefined);
        }
      }
      assert.deepEqual(posts.map((p) => p.status).filter((s) => s === "draft"), ["draft"]);
    }
  });

  it("is dated relative to now, newest first", () => {
    const a = getDemoSocialPosts("en", NOW);
    const b = getDemoSocialPosts("en", new Date(2027, 2, 15, 12, 0, 0));
    assert.notEqual(a[0].scheduledFor, b[0].scheduledFor);
    const times = a.map((p) => new Date(p.publishedAt ?? p.scheduledFor ?? 0).getTime());
    assert.deepEqual(times, [...times].sort((x, y) => y - x));
  });

  it("covers the story: kitchen, waterjet, open day, care kit, hotel teaser, team", () => {
    const text = demoSocialPackFor("en").map((p) => p.content.toLowerCase()).join("\n");
    for (const word of ["kitchen", "waterjet", "open day", "care kit", "hotel", "team"]) assert.ok(text.includes(word), word);
  });

  it("uses the brand of the company pack and nothing of the old demo", () => {
    for (const lang of LANGS) {
      const company = readFileSync(join(here, "../../../public/api/demo_seed/packs", lang, "company.php"), "utf8");
      const brand = /'brand' => '([^']+)'/.exec(company)?.[1];
      assert.ok(brand, `brand in ${lang} company pack`);
      for (const p of demoSocialPackFor(lang)) {
        assert.ok(p.accountName.startsWith(brand!), `${p.id}: account name starts with the brand`);
        assert.doesNotMatch(p.content + p.accountName + p.accountHandle, /ccrm|cstudios/i);
      }
    }
  });

  it("keeps the languages clean: no Slovak-only letters in hu/en, no Hungarian-only in sk/en", () => {
    const joined = (l: string) => demoSocialPackFor(l).map((p) => p.content).join(" ");
    assert.doesNotMatch(joined("en"), /[ľĺŕťďňôäőű]/);
    assert.doesNotMatch(joined("hu"), /[ľĺŕťďňôä]/);
    assert.doesNotMatch(joined("sk"), /[őű]/);
  });
});
