import test from "node:test";
import assert from "node:assert/strict";
import { formatFileSize, isBlockedUploadExtension, isPdfFile, isPreviewableCodeFile } from "./taskFilesApi.ts";

test("formatFileSize formats bytes, KB, and MB cleanly", () => {
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(2048), "2.0 KB");
  assert.equal(formatFileSize(15360), "15 KB");
  assert.equal(formatFileSize(2 * 1024 * 1024), "2.0 MB");
});

test("isPreviewableCodeFile recognizes source code, config, dotfiles, and logs", () => {
  assert.equal(isPreviewableCodeFile("index.ts"), true);
  assert.equal(isPreviewableCodeFile("task_files.php"), true);
  assert.equal(isPreviewableCodeFile("migration.sql"), true);
  assert.equal(isPreviewableCodeFile("Dockerfile"), true);
  assert.equal(isPreviewableCodeFile(".env.example"), true);
  assert.equal(isPreviewableCodeFile("patch.diff"), true);
  assert.equal(isPreviewableCodeFile("photo.png", "image/png"), false);
  assert.equal(isPdfFile("spec.pdf"), true);
});

test("isBlockedUploadExtension rejects OS executables and allows source code & docs", () => {
  assert.equal(isBlockedUploadExtension("installer.exe"), true);
  assert.equal(isBlockedUploadExtension("script.php.exe"), true);
  assert.equal(isBlockedUploadExtension("app.dmg"), true);
  assert.equal(isBlockedUploadExtension("api.php"), false);
  assert.equal(isBlockedUploadExtension("Dockerfile"), false);
  assert.equal(isBlockedUploadExtension(".env.local"), false);
  assert.equal(isBlockedUploadExtension("architecture.pdf"), false);
});
