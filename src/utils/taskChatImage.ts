/**
 * Client-side screenshot & photo compression before uploading to Task Chat.
 *
 * Resizes images wider/taller than 1600px and transcodes large raster images to
 * WebP (~82% quality) with JPEG fallback, leaving animated GIFs and already small
 * (<250 KB) files untouched.
 */

const MAX_DIMENSION = 1600;
const SKIP_BELOW_BYTES = 250 * 1024;
const WEBP_QUALITY = 0.82;

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
}

async function decodeImageDimensionsAndDraw(
  file: File
): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cleanup: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement below
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode image."));
      el.src = url;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export async function compressTaskChatImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
    throw new Error("Unsupported image format.");
  }
  if (file.type === "image/gif" || /\.gif$/i.test(file.name)) {
    return file;
  }
  if (typeof document === "undefined") {
    return file;
  }

  let decoded: Awaited<ReturnType<typeof decodeImageDimensionsAndDraw>> | null = null;
  try {
    decoded = await decodeImageDimensionsAndDraw(file);
    const { width, height } = decoded;
    if (width <= 0 || height <= 0) return file;

    const maxSide = Math.max(width, height);
    if (maxSide <= MAX_DIMENSION && file.size <= SKIP_BELOW_BYTES) {
      return file;
    }

    const scale = maxSide > MAX_DIMENSION ? MAX_DIMENSION / maxSide : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    decoded.draw(ctx, targetW, targetH);

    let outBlob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
    let outExt = "webp";
    let outMime = "image/webp";
    if (!outBlob || (outBlob.type !== "image/webp" && outBlob.size > 0)) {
      outBlob = await canvasToBlob(canvas, "image/jpeg", WEBP_QUALITY);
      outExt = "jpg";
      outMime = "image/jpeg";
    }

    if (!outBlob) return file;
    // Keep original if it already fits within MAX_DIMENSION and is smaller than compressed output.
    if (maxSide <= MAX_DIMENSION && outBlob.size >= file.size) {
      return file;
    }

    const baseName = (file.name || "screenshot").replace(/\.[^.]+$/, "");
    return new File([outBlob], `${baseName}.${outExt}`, {
      type: outMime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    decoded?.cleanup();
  }
}
