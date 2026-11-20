import test from "node:test";
import assert from "node:assert/strict";
import { isGithubCompareUrl, normalizeGithubBranch, normalizeGithubRepo } from "./githubRepo.ts";

test("repository: plain, pasted URL, .git and trailing slash", () => {
  assert.equal(normalizeGithubRepo("Acme/Shop"), "Acme/Shop");
  assert.equal(normalizeGithubRepo("https://github.com/acme/shop"), "acme/shop");
  assert.equal(normalizeGithubRepo(" https://github.com/acme/shop.git "), "acme/shop");
  assert.equal(normalizeGithubRepo("https://www.github.com/acme/shop/"), "acme/shop");
  assert.equal(normalizeGithubRepo("github.com/acme/my.repo_1"), "acme/my.repo_1");
});

test("repository: anything that is not owner/name is null", () => {
  for (const bad of ["", "shop", "acme/shop/tree/main", "-acme/shop", "acme/sh op", "acme/..", "acme/shop\n.git", "acme/sh\nop", null, undefined, 5]) {
    assert.equal(normalizeGithubRepo(bad), null, String(bad));
  }
});

test("branch: trimmed, no whitespace or control characters, at most 200", () => {
  assert.equal(normalizeGithubBranch(" release/1.2 "), "release/1.2");
  assert.equal(normalizeGithubBranch("   "), null);
  assert.equal(normalizeGithubBranch("a b"), null);
  assert.equal(normalizeGithubBranch("a\u0007b"), null);
  assert.equal(normalizeGithubBranch("a".repeat(201)), null);
  assert.equal(normalizeGithubBranch("a".repeat(200))?.length, 200);
  assert.equal(normalizeGithubBranch(undefined), null);
});

test("compare link: only github.com compare or commit links", () => {
  assert.equal(isGithubCompareUrl("https://github.com/acme/shop/compare/a...b"), true);
  assert.equal(isGithubCompareUrl("https://github.com/acme/shop/commit/0123abc"), true);
  for (const bad of ["javascript:alert(1)", "http://github.com/acme/shop/compare/a...b", "https://evil.example/acme/shop/compare/a...b",
    "https://github.com.evil.example/a/b/compare/x", "https://github.com/acme/shop/pull/3", "https://github.com/acme/shop/compare/a b",
    "https://github.com/acme/shop/compare/a\n", "", null, 5]) {
    assert.equal(isGithubCompareUrl(bad), false, String(bad));
  }
});
