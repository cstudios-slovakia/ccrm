/**
 * Public API of the e-mail builder (docs/NEWSLETTER.md package 1B). Package 2B mounts
 * `EmailBuilder`; the module screens and the sending code use the rest.
 */
export { EmailBuilder } from './EmailBuilder.tsx';
export type { EmailBuilderProps } from './EmailBuilder.tsx';
export { EmailPreview, EmailPreviewModal } from './EmailPreview.tsx';
export type { EmailPreviewProps } from './EmailPreview.tsx';

export { renderEmail } from './renderEmail.ts';
export { htmlToPlainText } from './renderText.ts';

export { substituteMergeTags, parseMergeTags, listMergeTags, findUnknownMergeTags, sampleMergeValues, MERGE_TAGS } from './mergeTags.ts';
export type { MergeContext, MergeMode, MergeValues, MergeTagInfo } from './mergeTags.ts';

export {
  THEME_DEFAULTS,
  FONT_STACKS,
  CONTENT_WIDTH_MIN,
  CONTENT_WIDTH_MAX,
  ROW_LAYOUTS,
  BLOCK_TYPES,
  SOCIAL_NETWORKS,
  defaultBody,
  defaultHeader,
  defaultFooter,
  emptyDoc,
  newBlock,
  newRow,
} from './defaults.ts';

export type {
  Align,
  BlockType,
  CompanyInfo,
  EmailBlock,
  EmailColumn,
  EmailDoc,
  EmailRow,
  NewsletterTheme,
  RenderInput,
  RenderResult,
  RenderWarning,
  RowLayout,
  SocialNetwork,
} from './types.ts';
