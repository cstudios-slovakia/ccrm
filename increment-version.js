import fs from "fs";
import path from "path";

const versionFilePath = path.join(process.cwd(), "src", "utils", "version.ts");

// Versions carry a release codename: "1.9.0-Jackfruit". Two bugs used to bite here:
//
//  1. `"1.9.0-Jackfruit".split(".").map(Number)` yields [1, 9, NaN], so the
//     isNaN guard sent every real version down the "fallback" branch and reset
//     it to 1.1.0.
//  2. The file was rewritten from scratch with only the VERSION line, silently
//     dropping VERSION_CODENAME — which RagAiView imports at module scope, so
//     the RAG assistant ended up named `undefined`.
//
// So: parse the codename out, bump only the patch digit, and patch the existing
// file in place instead of overwriting it.
const VERSION_RE = /VERSION\s*=\s*"([^"]+)"/;

const DEFAULT_FILE = `export const VERSION = "1.1.0";
export const VERSION_CODENAME = VERSION.split("-")[1] || "Release";
`;

try {
  if (!fs.existsSync(versionFilePath)) {
    fs.writeFileSync(versionFilePath, DEFAULT_FILE, "utf8");
    console.log("Initialized version file to 1.1.0");
    process.exit(0);
  }

  const fileContent = fs.readFileSync(versionFilePath, "utf8");
  const match = fileContent.match(VERSION_RE);
  const currentVersion = match?.[1] ?? "1.1.0";

  // "1.9.0-Jackfruit" -> numeric "1.9.0" + suffix "-Jackfruit"
  const dash = currentVersion.indexOf("-");
  const numeric = dash === -1 ? currentVersion : currentVersion.slice(0, dash);
  const suffix = dash === -1 ? "" : currentVersion.slice(dash);

  const parts = numeric.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    console.error(`Unrecognised version "${currentVersion}" — leaving it untouched.`);
    process.exit(1);
  }

  parts[2] += 1;
  const nextVersion = `${parts.join(".")}${suffix}`;

  // Replace just the VERSION literal so every other export in the file survives.
  const updated = fileContent.replace(VERSION_RE, `VERSION = "${nextVersion}"`);
  fs.writeFileSync(versionFilePath, updated, "utf8");
  console.log(`Auto-incremented version: ${currentVersion} -> ${nextVersion}`);
} catch (error) {
  console.error("Failed to auto-increment version:", error);
  process.exit(1);
}
