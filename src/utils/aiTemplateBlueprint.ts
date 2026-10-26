import type { AiCustomTemplate } from "../types";

/**
 * Reading an AI price-offer template blueprint.
 *
 * The blueprint is produced by an LLM from an uploaded sample PDF, so every field
 * is untrusted. The server validates it once on the way in; this module validates
 * it again on the way out, because what is stored may be older than the current
 * rules and the renderer must never interpolate an arbitrary string into markup.
 *
 * The look of a template is a *bounded* set of variants — enums, hex colours and
 * length-capped headings — never CSS or HTML from the model. A template saved
 * before the variants existed has no `layout` and keeps rendering exactly as it did.
 */

/** Every block the document has, in the order the Standard template prints them. */
export const AI_TEMPLATE_SECTIONS = [
  "header",
  "client_metadata",
  "greeting",
  "usp_grid",
  "reassurance",
  "items_table",
  "total_box",
  "key_parameters",
  "next_steps",
  "signoff",
  "footer"
] as const;
export type AiTemplateSection = (typeof AI_TEMPLATE_SECTIONS)[number];

export const HEADER_STYLES = ["light", "dark-band", "accent-band"] as const;
export const TABLE_HEADER_STYLES = ["filled-primary", "filled-dark", "underline"] as const;
export const USP_CARD_STYLES = ["soft", "left-border", "outlined"] as const;
export const TOTAL_BANNER_STYLES = ["gradient", "solid-dark", "outlined"] as const;
/** Fonts the app already ships: the default document face, and two system stacks. */
export const FONT_FAMILIES = ["sans", "serif", "mono"] as const;
export const BADGE_STYLES = ["rounded", "square", "pill"] as const;

export type HeaderStyle = (typeof HEADER_STYLES)[number];
export type TableHeaderStyle = (typeof TABLE_HEADER_STYLES)[number];
export type UspCardStyle = (typeof USP_CARD_STYLES)[number];
export type TotalBannerStyle = (typeof TOTAL_BANNER_STYLES)[number];
export type TemplateFont = (typeof FONT_FAMILIES)[number];
export type BadgeStyle = (typeof BADGE_STYLES)[number];

/** Section titles the sample may word differently. An empty value keeps the built-in label. */
export interface AiTemplateHeadings {
  usp: string;
  items: string;
  nextStep: string;
}

export interface AiTemplateLayout {
  headerStyle: HeaderStyle;
  tableHeaderStyle: TableHeaderStyle;
  uspCardStyle: UspCardStyle;
  totalBannerStyle: TotalBannerStyle;
  fontFamily: TemplateFont;
  headings: AiTemplateHeadings;
}

export const HEADING_MAX_LENGTH = 90;

/** The Standard-like look every variant starts from. */
export const DEFAULT_LAYOUT: AiTemplateLayout = {
  headerStyle: "light",
  tableHeaderStyle: "filled-primary",
  uspCardStyle: "soft",
  totalBannerStyle: "gradient",
  fontFamily: "sans",
  headings: { usp: "", items: "", nextStep: "" }
};

/** CSS stack for each allowed font; `sans` is the document's own face, so it needs no override. */
export const FONT_STACKS: Record<TemplateFont, string | undefined> = {
  sans: undefined,
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", "Courier New", monospace'
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Anything that is not a plain hex colour is dropped rather than interpolated into
 * a style attribute — and hex is also what the `${color}20` alpha-suffix trick the
 * template uses relies on being well-formed. `#abc` is expanded to `#aabbcc`.
 */
export const safeColor = (value: unknown, fallback: string): string => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!HEX.test(trimmed)) return fallback;
  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
};

/** WCAG relative luminance of a `#rrggbb` colour: 0 is black, 1 is white. */
export const luminance = (hex: string): number => {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};

/** White or near-black, whichever reads better on a fill of this colour. */
export const readableTextOn = (fill: string): string => (luminance(fill) > 0.45 ? "#0f172a" : "#ffffff");

const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** A heading override: a plain, trimmed, length-capped single line; anything else is "use the built-in label". */
export const safeHeading = (value: unknown): string => {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const oneLine = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(oneLine).slice(0, HEADING_MAX_LENGTH).join("");
};

/**
 * The blocks to print, in order: known ids only, each once, and every required
 * block that the order left out appended at its Standard position — so a model
 * can reorder the document but never drop a field the offer must carry.
 */
export const normalizeSectionsOrder = (raw: unknown): AiTemplateSection[] => {
  const known = new Set<string>(AI_TEMPLATE_SECTIONS);
  const seen = new Set<string>();
  const order: AiTemplateSection[] = [];
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === "string" && known.has(id) && !seen.has(id)) {
        seen.add(id);
        order.push(id as AiTemplateSection);
      }
    }
  }
  for (const id of AI_TEMPLATE_SECTIONS) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
};

/** Validates a stored or model-provided `layout`; every missing or unknown field takes the default. */
export const normalizeLayout = (raw: unknown): AiTemplateLayout => {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const headings = src.headings && typeof src.headings === "object" ? (src.headings as Record<string, unknown>) : {};
  return {
    headerStyle: oneOf(HEADER_STYLES, src.headerStyle, DEFAULT_LAYOUT.headerStyle),
    tableHeaderStyle: oneOf(TABLE_HEADER_STYLES, src.tableHeaderStyle, DEFAULT_LAYOUT.tableHeaderStyle),
    uspCardStyle: oneOf(USP_CARD_STYLES, src.uspCardStyle, DEFAULT_LAYOUT.uspCardStyle),
    totalBannerStyle: oneOf(TOTAL_BANNER_STYLES, src.totalBannerStyle, DEFAULT_LAYOUT.totalBannerStyle),
    fontFamily: oneOf(FONT_FAMILIES, src.fontFamily, DEFAULT_LAYOUT.fontFamily),
    headings: {
      usp: safeHeading(headings.usp),
      items: safeHeading(headings.items),
      nextStep: safeHeading(headings.nextStep)
    }
  };
};

export interface ResolvedAiTemplate {
  /** No `layout` was stored: the template predates the variants and renders as it always did. */
  legacy: boolean;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    /** Near-black used for dark bands, table heads and banners. */
    dark: string;
    /** Page colour; null leaves the document white. */
    background: string | null;
    /** Body text colour; null leaves the document's own slate. */
    text: string | null;
  };
  layout: AiTemplateLayout;
  sections: AiTemplateSection[];
  badgeStyle: BadgeStyle;
  bannerText: string;
}

/**
 * Everything the renderer reads from a template, validated.
 *
 * Page and text colours are only honoured when they keep the document legible —
 * a page that is not light, or text that is not dark, would print unreadable —
 * and are ignored on a legacy template.
 */
export const resolveAiTemplate = (template?: Partial<AiCustomTemplate> | null): ResolvedAiTemplate => {
  const legacy = !template?.layout || typeof template.layout !== "object";
  const colors = template?.colors;

  const primary = safeColor(colors?.primary, "#1e1b4b");
  const secondary = safeColor(colors?.secondary, "#4338ca");
  const accent = safeColor(colors?.accent, "#6366f1");

  const rawText = safeColor(colors?.text, "");
  const rawBackground = safeColor(colors?.background, "");
  const text = !legacy && rawText && luminance(rawText) <= 0.35 ? rawText : null;
  const background = !legacy && rawBackground && luminance(rawBackground) >= 0.8 ? rawBackground : null;

  return {
    legacy,
    colors: {
      primary,
      secondary,
      accent,
      dark: text ?? "#0f172a",
      background,
      text
    },
    layout: legacy ? DEFAULT_LAYOUT : normalizeLayout(template?.layout),
    // A legacy template always printed the Standard order, whatever it stored.
    sections: legacy ? [...AI_TEMPLATE_SECTIONS] : normalizeSectionsOrder(template?.sectionsOrder),
    badgeStyle: oneOf(BADGE_STYLES, template?.badgeStyle, "rounded"),
    bannerText: typeof template?.customBannerText === "string" ? template.customBannerText.trim() : ""
  };
};
