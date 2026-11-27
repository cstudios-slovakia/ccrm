/**
 * The e-mail document model (docs/NEWSLETTER.md C6) and the theme (C3).
 * Pure types: no runtime code, nothing here imports React.
 */

export type EmailDoc = { version: 1; rows: EmailRow[] };

/** Column width ratios: '1-2' is one third and two thirds. */
export type RowLayout = '1' | '1-1' | '1-2' | '2-1' | '1-1-1';
export type Align = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';

export type EmailRow = {
  id: string;
  layout: RowLayout;
  /** Length matches the layout (1, 2, 2, 2, 3). */
  columns: EmailColumn[];
  /** Full-width band behind the content. */
  background?: string;
  /** Inside the content width; default `theme.contentBackground`. */
  contentBackground?: string;
  /** px, default 16. */
  paddingTop?: number;
  /** px, default 16. */
  paddingBottom?: number;
  /** Default true. */
  stackOnMobile?: boolean;
};

export type EmailColumn = {
  id: string;
  blocks: EmailBlock[];
  /** px, default 16. */
  paddingX?: number;
  verticalAlign?: VerticalAlign;
};

export type SocialNetwork = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'youtube' | 'tiktok' | 'website';
export type SocialItem = { network: SocialNetwork; url: string };

export type TextBlock = { id: string; type: 'text'; html: string; align?: Align; fontSize?: number; color?: string; lineHeight?: number };
export type HeadingBlock = { id: string; type: 'heading'; html: string; level: 1 | 2 | 3; align?: Align; color?: string };
export type ImageBlock = { id: string; type: 'image'; src: string; alt: string; href?: string; width?: number; align?: Align };
export type ButtonBlock = {
  id: string; type: 'button'; label: string; href: string; align?: Align;
  background?: string; color?: string; radius?: number; fullWidth?: boolean;
};
export type DividerBlock = { id: string; type: 'divider'; color?: string; thickness?: number; widthPercent?: number };
export type SpacerBlock = { id: string; type: 'spacer'; height: number };
export type SocialBlock = { id: string; type: 'social'; align?: Align; items: SocialItem[] };
export type HtmlBlock = { id: string; type: 'html'; html: string };

export type EmailBlock =
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | SocialBlock
  | HtmlBlock;

export type BlockType = EmailBlock['type'];

export type NewsletterTheme = {
  /** 520..800, default 600. */
  contentWidth: number;
  pageBackground: string;
  contentBackground: string;
  /** One of the web-safe stacks in defaults.ts (FONT_STACKS). */
  fontFamily: string;
  textColor: string;
  linkColor: string;
  buttonBackground: string;
  buttonTextColor: string;
};

export type RenderWarning = {
  level: 'error' | 'warning';
  code: string;
  blockId?: string;
  message: { en: string; sk: string; hu: string };
};

/** Company data used to build the default header and footer. */
export type CompanyInfo = { name: string; address?: string; logoUrl?: string };

export type RenderInput = {
  header?: EmailDoc | null;
  body: EmailDoc;
  footer?: EmailDoc | null;
  theme: NewsletterTheme;
  subject: string;
  preheader?: string;
  /** e.g. window.location.origin; makes relative image URLs absolute. */
  assetBaseUrl: string;
  lang: string;
};

export type RenderResult = { html: string; text: string; warnings: RenderWarning[] };
