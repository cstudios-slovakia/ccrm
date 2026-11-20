import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGithubBranch, normalizeGithubRepo } from "./githubRepo.ts";

test("repository: plain, pasted URL, .git and trailing slash", () => {
  assert.equal(normalizeGithubRepo("Acme/Shop"), "Acme/Shop");
  assert.equal(normalizeGithubRepo("https://github.com/acme/shop"), "acme/shop");
  assert.equal(normalizeGithubRepo(" https://github.com/acme/shop.git "), "acme/shop");
  assert.equal(normalizeGithubRepo("https://www.github.com/acme/shop/"), "acme/shop");
  assert.equal(normalizeGithubRepo("github.com/acme/my.repo_1"), "acme/my.repo_1");
});

test("repository: anything that is not owner/name is null", () => {
  for (const bad of ["", "shop", "acme/shop/tree/main", "-acme/shop", "acme/sh op", "acme/..", null, undefined, 5]) {
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
