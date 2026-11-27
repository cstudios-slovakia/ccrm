/**
 * Build the Chrome time tracker and zip it to public/downloads/<product-slug>-time-tracker.zip
 * (the slug comes from PRODUCT_NAME in src/utils/brand.ts). The old ccrm-time-tracker.zip is
 * written too, so links and installs that still use that name keep working.
 * Does not run the app build (that rewrites dist/).
 */
import { deflateRawSync, deflateSync } from "node:zlib";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const extensionRoot = join(root, "extensions", "chrome-time-tracker");
const built = join(extensionRoot, "dist");
const productName = /export const PRODUCT_NAME\s*=\s*"([^"]+)"/.exec(await readFile(join(root, "src", "utils", "brand.ts"), "utf8"))?.[1];
if (!productName) throw new Error("PRODUCT_NAME not found in src/utils/brand.ts");
const productSlug = productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const downloads = join(root, "public", "downloads");
const zipPath = join(downloads, `${productSlug}-time-tracker.zip`);
const legacyZipPath = join(downloads, "ccrm-time-tracker.zip");

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function rgbaPng(size, pixelFn) {
  const raw = Buffer.alloc((1 + size * 4) * size);
  for (let y = 0; y < size; y++) {
    const rowOff = y * (1 + size * 4);
    raw[rowOff] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x + 0.5, y + 0.5, size);
      const o = rowOff + 1 + x * 4;
      raw[o] = Math.max(0, Math.min(255, Math.round(r)));
      raw[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      raw[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      raw[o + 3] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + body.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 4 + body.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawTrackerIcon(bgRgb, mode, frame = 0) {
  return (x, y, s) => {
    const cx = s / 2;
    const cy = s / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const edge = 0.75;

    // Alert pulse outer halo for alert-0..3 frames
    const maxR = s * 0.46;
    let bodyR = maxR;
    let haloAlpha = 0;
    if (mode === "alert") {
      const ratios = [0.76, 0.88, 0.98, 0.88];
      const haloR = maxR * ratios[frame % 4];
      bodyR = maxR * 0.74;
      if (dist <= haloR && dist > bodyR - edge) {
        const ringAlpha = Math.max(0, Math.min(1, haloR - dist + edge)) * (frame === 2 ? 0.85 : frame === 0 ? 0.35 : 0.65);
        haloAlpha = ringAlpha;
      }
    }

    const bodyAlpha = Math.max(0, Math.min(1, bodyR - dist + edge));
    if (bodyAlpha <= 0 && haloAlpha <= 0) return [0, 0, 0, 0];

    let [r, g, b] = bgRgb;
    let alpha = bodyAlpha;
    if (bodyAlpha <= 0 && haloAlpha > 0) {
      return [bgRgb[0], bgRgb[1], bgRgb[2], haloAlpha * 255];
    }

    // Inner glyph
    const nr = dist / bodyR;
    const nx = dx / bodyR;
    const ny = dy / bodyR;
    let glyph = 0;
    if (mode === "idle") {
      // Clock ring + hands (12 o'clock and 3 o'clock)
      if (Math.abs(nr - 0.66) < 0.1) glyph = 1;
      else if (Math.abs(nx) < 0.09 && ny >= -0.46 && ny <= 0.05) glyph = 1;
      else if (Math.abs(ny) < 0.09 && nx >= -0.04 && nx <= 0.38) glyph = 1;
    } else if (mode === "running") {
      // Clean white center dot + crisp clock ring
      if (Math.abs(nr - 0.68) < 0.09) glyph = 0.4;
      if (nr < 0.34) glyph = 1;
    } else if (mode === "alert") {
      // Exclamation mark ("!")
      if (Math.abs(nx) < 0.14 && ny >= -0.52 && ny <= 0.14) glyph = 1;
      else if (Math.hypot(nx, ny - 0.42) < 0.15) glyph = 1;
    }

    if (glyph > 0) {
      r = r * (1 - glyph) + 255 * glyph;
      g = g * (1 - glyph) + 255 * glyph;
      b = b * (1 - glyph) + 255 * glyph;
    }
    if (haloAlpha > bodyAlpha) alpha = haloAlpha;
    return [r, g, b, alpha * 255];
  };
}

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(time, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

const iconDir = join(extensionRoot, "public", "icons");
await mkdir(iconDir, { recursive: true });
const SIZES = [16, 32, 48, 128];
for (const size of SIZES) {
  await writeFile(join(iconDir, `icon-${size}.png`), rgbaPng(size, drawTrackerIcon([13, 148, 136], "idle")));
  await writeFile(join(iconDir, `running-${size}.png`), rgbaPng(size, drawTrackerIcon([225, 29, 72], "running")));
  const alertColors = [
    [245, 158, 11],
    [239, 108, 36],
    [225, 29, 72],
    [239, 108, 36],
  ];
  for (let frame = 0; frame < 4; frame++) {
    await writeFile(join(iconDir, `alert-${frame}-${size}.png`), rgbaPng(size, drawTrackerIcon(alertColors[frame], "alert", frame)));
  }
}
await writeFile(join(iconDir, "icon128.png"), rgbaPng(128, drawTrackerIcon([13, 148, 136], "idle")));

await build({ configFile: join(extensionRoot, "vite.config.ts") });

const files = [];
for (const full of await walk(built)) {
  const name = relative(built, full).split(sep).join("/");
  files.push({ name, data: await readFile(full) });
}
await mkdir(dirname(zipPath), { recursive: true });
const zip = zipStore(files);
await writeFile(zipPath, zip);
await writeFile(legacyZipPath, zip);
if (!files.some((file) => file.name === "manifest.json")) {
  throw new Error("extension zip is missing manifest.json");
}
console.log(`Wrote ${zipPath} (${zip.length} bytes, ${files.length} files)`);
