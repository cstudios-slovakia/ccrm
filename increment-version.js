import fs from "fs";
import path from "path";

const versionFilePath = path.join(process.cwd(), "src", "utils", "version.ts");

try {
  let currentVersion = "1.1.0";
  
  if (fs.existsSync(versionFilePath)) {
    const fileContent = fs.readFileSync(versionFilePath, "utf8");
    const match = fileContent.match(/VERSION\s*=\s*"([^"]+)"/);
    if (match && match[1]) {
      currentVersion = match[1];
    }
  }

  // Parse version digits: major.minor.patch
  const parts = currentVersion.split(".").map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    parts[2] += 1; // Increment patch digit
    const nextVersion = parts.join(".");
    
    // Write updated version back
    fs.writeFileSync(versionFilePath, `export const VERSION = "${nextVersion}";\n`, "utf8");
    console.log(`Auto-incremented version: ${currentVersion} -> ${nextVersion}`);
  } else {
    // Fallback default
    fs.writeFileSync(versionFilePath, `export const VERSION = "1.1.0";\n`, "utf8");
    console.log("Initialized version file to 1.1.0");
  }
} catch (error) {
  console.error("Failed to auto-increment version:", error);
}
