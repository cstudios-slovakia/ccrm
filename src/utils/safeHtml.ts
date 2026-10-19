import DOMPurify from "dompurify";

/**
 * One place for every "user-supplied HTML goes into the DOM" decision.
 *
 * Why this exists: tickets (public widget, inbound e-mail) and shared block notes
 * carry HTML that other people's browsers — an administrator's, above all —
 * render. A regex that strips `<script>` and `on*=` cannot do that safely
 * (`<img/src=x/onerror=…>`, `<svg onload=…>`, `&#106;avascript:` all walk past
 * it). DOMPurify parses the markup the way the browser will and keeps only an
 * explicit allowlist.
 *
 * Outside a browser (the node unit tests, server rendering) there is no DOM to
 * sanitise with, so every function here fails SAFE: the HTML is escaped to inert
 * text rather than passed through.
 */

export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const domAvailable = (): boolean =>
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  DOMPurify.isSupported === true;

export type HtmlProfile = "ticket" | "block";

const PROFILES: Record<HtmlProfile, { tags: string[]; attrs: string[] }> = {
  // Ticket descriptions and replies: text formatting, lists, quotes, code, links, images.
  ticket: {
    tags: [
      "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "del", "ul", "ol", "li",
      "blockquote", "code", "pre", "span", "div", "a", "img", "h1", "h2", "h3", "h4",
    ],
    attrs: ["href", "src", "alt", "title", "target", "rel", "class"],
  },
  // Block-editor notes: inline formatting only (colours/highlights via style or <font>).
  block: {
    tags: [
      "b", "i", "em", "strong", "u", "s", "strike", "a", "code", "br", "span", "font", "div", "p", "mark",
    ],
    attrs: ["href", "target", "rel", "class", "style", "color"],
  },
};

// A style attribute can still position an invisible full-screen overlay over the app
// (phishing / click-jacking) or call out to a tracking URL, so only plain presentation
// properties with plain values survive.
const SAFE_STYLE_PROPS = new Set([
  "color", "background-color", "font-weight", "font-style", "text-decoration",
  "text-decoration-line", "text-align",
]);
const SAFE_STYLE_VALUE = /^[#a-z0-9(),.%\s-]+$/i;

export const filterStyleAttribute = (style: string): string =>
  style
    .split(";")
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const idx = decl.indexOf(":");
      if (idx < 1) return false;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      return SAFE_STYLE_PROPS.has(prop) && SAFE_STYLE_VALUE.test(value) && !/url\s*\(|expression/i.test(value);
    })
    .join("; ");

let hooksInstalled = false;
const installHooks = (): void => {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.hasAttribute("target")) {
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (node.hasAttribute("style")) {
      const cleaned = filterStyleAttribute(node.getAttribute("style") || "");
      if (cleaned) node.setAttribute("style", cleaned);
      else node.removeAttribute("style");
    }
  });
};

/** Sanitise untrusted HTML to the allowlist of `profile`. Never throws. */
export const sanitizeRichHtml = (raw: string, profile: HtmlProfile): string => {
  if (!raw) return "";
  if (!domAvailable()) return escapeHtml(raw);
  installHooks();
  const { tags, attrs } = PROFILES[profile];
  return String(
    DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: tags,
      ALLOWED_ATTR: attrs,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    }),
  );
};

/**
 * The visible text of an HTML string, parsed in an inert document (nothing loads, no
 * handler fires). Assigning untrusted markup to a detached element's innerHTML is NOT
 * inert — an <img onerror> still fires — so use this to read text out of stored HTML.
 */
export const htmlToText = (html: string): string => {
  if (!html) return "";
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, "");
  return new DOMParser().parseFromString(html, "text/html").body.textContent || "";
};

/**
 * A link target for an attachment, or "#" when it is not one we are willing to put
 * in an href / img src: a same-origin path (`/uploads/…`), a relative path, http(s),
 * or a base64 raster image. `javascript:`, `data:text/html`, `vbscript:` and friends —
 * including variants with embedded tabs/newlines the browser would strip — are refused.
 */
export const safeAttachmentHref = (raw: string | null | undefined): string => {
  const value = (raw ?? "").trim();
  if (!value) return "#";
  // Control characters (tab, newline, …) are removed by URL parsers, which lets
  // "java\tscript:" through any scheme check done on the raw text.
  if (/[\u0000-\u001f\u007f]/.test(value)) return "#";
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return "#"; // protocol-relative: an arbitrary host
  if (value.startsWith("/")) return value;
  if (/^[a-z][a-z0-9+.\-]*:/i.test(value)) return "#"; // any other scheme
  return value; // relative path such as "uploads/x.pdf"
};
