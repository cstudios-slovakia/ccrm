import type { TaskFile } from "../types";

export const MAX_TASK_FILE_BYTES = 25 * 1024 * 1024;

const BLOCKED_EXTS = new Set([
  "exe", "msi", "dll", "sys", "drv", "cpl", "ocx", "scr", "pif",
  "com", "bat", "cmd", "vbs", "vbe", "wsf", "wsh", "hta", "jar",
  "apk", "ipa", "dmg", "pkg", "appimage", "deb", "rpm",
]);

const CODE_EXACT_NAMES = new Set([
  "dockerfile", "makefile", "readme", "license",
  ".gitignore", ".gitattributes", ".htaccess", ".env", ".editorconfig", ".npmrc",
]);

const CODE_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "php", "phtml", "py", "rb", "go", "rs",
  "java", "kt", "kts", "swift", "c", "cpp", "cc", "h", "hpp", "cs", "vue", "svelte",
  "astro", "html", "htm", "css", "scss", "sass", "less", "sql", "json", "jsonc",
  "yaml", "yml", "toml", "ini", "conf", "cfg", "env", "xml", "svg", "md", "markdown",
  "txt", "log", "csv", "tsv", "sh", "bash", "zsh", "fish", "ps1", "diff", "patch",
  "graphql", "gql", "prisma", "tf", "tfvars", "lock", "properties", "gradle",
]);

export function formatFileSize(bytes: number): string {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function isBlockedUploadExtension(fileName: string): boolean {
  const clean = fileName.trim().toLowerCase();
  if (!clean) return true;
  const parts = clean.split(".");
  const check = clean.startsWith(".") ? parts.slice(2) : parts.slice(1);
  return check.some((seg) => BLOCKED_EXTS.has(seg));
}

export function isPreviewableCodeFile(fileName: string, mimeType = ""): boolean {
  const lower = fileName.trim().toLowerCase();
  if (CODE_EXACT_NAMES.has(lower) || lower.startsWith(".env.") || lower.startsWith("dockerfile.")) {
    return true;
  }
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";
  if (CODE_EXTS.has(ext)) return true;
  const m = mimeType.toLowerCase();
  return m.startsWith("text/") || m === "application/json" || m === "application/xml" || m === "application/javascript";
}

export function isPdfFile(fileName: string, mimeType = ""): boolean {
  return fileName.trim().toLowerCase().endsWith(".pdf") || mimeType.toLowerCase() === "application/pdf";
}

export async function fetchTaskFiles(
  taskId: string,
  signal?: AbortSignal,
): Promise<{ files: TaskFile[]; fileCount: number }> {
  const res = await fetch(`api/task_files.php?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Failed to load files (${res.status}).`);
  }
  return {
    files: Array.isArray(data.files) ? (data.files as TaskFile[]) : [],
    fileCount: Number(data.fileCount ?? 0),
  };
}

export async function uploadTaskFile(taskId: string, file: File): Promise<{ file: TaskFile; fileCount: number }> {
  if (file.size <= 0 || file.size > MAX_TASK_FILE_BYTES) {
    throw new Error("File size must be between 1 byte and 25 MB.");
  }
  if (isBlockedUploadExtension(file.name)) {
    throw new Error(`Executable file type is not allowed: ${file.name}`);
  }
  const form = new FormData();
  form.append("taskId", taskId);
  form.append("file", file, file.name);
  const res = await fetch("api/task_files.php", {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success || !data?.file) {
    throw new Error(data?.error || `Upload failed (${res.status}).`);
  }
  return {
    file: data.file as TaskFile,
    fileCount: Number(data.fileCount ?? 0),
  };
}

export async function deleteTaskFile(taskId: string, fileId: string): Promise<{ fileCount: number }> {
  const res = await fetch("api/task_files.php", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", taskId, fileId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Delete failed (${res.status}).`);
  }
  return { fileCount: Number(data.fileCount ?? 0) };
}

export async function fetchTaskFileTextPreview(
  fileId: string,
  signal?: AbortSignal,
): Promise<{ text: string; truncated: boolean; language: string; fileName: string; sizeBytes: number }> {
  const res = await fetch(`api/task_files.php?action=preview_text&id=${encodeURIComponent(fileId)}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Preview failed (${res.status}).`);
  }
  return {
    text: String(data.text ?? ""),
    truncated: Boolean(data.truncated),
    language: String(data.language ?? "text"),
    fileName: String(data.fileName ?? ""),
    sizeBytes: Number(data.sizeBytes ?? 0),
  };
}
