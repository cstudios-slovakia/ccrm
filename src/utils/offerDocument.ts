/**
 * Block document for a reconstructed price-offer PDF.
 *
 * The PHP copy of these rules is `public/api/offer_document.php`. There is no
 * shared runtime — a change here has to be made there too. The normaliser is
 * the security boundary: model JSON is a hint, and anything it does not
 * describe is dropped rather than defaulted into the Signum look.
 */
import { safeColor } from "./aiTemplateBlueprint.ts";

export const CATALOG_FIELDS = [
  "company.name", "company.subtitle", "company.logo", "company.street", "company.city",
  "company.postalCode", "company.country", "company.companyId", "company.taxId", "company.vatId",
  "company.email", "company.phone", "company.phoneSecondary", "company.website", "company.iban",
  "company.swift", "company.bankName", "company.socialProof",
  "offer.documentNumber", "offer.title", "offer.subject", "offer.location", "offer.issuedAt",
  "offer.validUntil", "offer.clientName", "offer.clientEmail", "offer.clientPhone", "offer.clientStreet",
  "offer.clientCity", "offer.clientPostalCode", "offer.clientCountry", "offer.clientIco", "offer.clientDic",
  "offer.clientIcdph", "offer.greetingNote", "offer.introNote", "offer.reassuranceNote", "offer.nextStepsNote",
  "offer.closingNote", "offer.signOffTeam", "offer.durationText", "offer.startDateText", "offer.warrantyText"
] as const;

export type CatalogFieldId = (typeof CATALOG_FIELDS)[number];

/** Not a field block — the rail uses these for the table, the totals and the benefit cards. */
export const SYNTHETIC_FIELDS = ["offer.items", "offer.totals", "offer.uspCards"] as const;

export const ITEM_COLUMNS = [
  "name", "description", "quantity", "unit", "unitPrice", "vatRate", "discountPct", "totalPrice"
] as const;

export type ItemsColumnId = (typeof ITEM_COLUMNS)[number];

export const DEFAULT_ITEM_COLUMNS: ItemsColumnId[] = ["name", "quantity", "unit", "unitPrice", "totalPrice"];

const CATALOG_SET = new Set<string>(CATALOG_FIELDS);
const ITEM_SET = new Set<string>(ITEM_COLUMNS);
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_BLOCKS = 80;
const MAX_DEPTH = 4;
const MAX_CUSTOM = 24;

export interface BlockStyle {
  color?: string;
  background?: string;
  borderColor?: string;
  fontSize?: "sm" | "md" | "lg" | "xl" | "title";
  weight?: "regular" | "medium" | "bold";
  align?: "left" | "center" | "right";
  radius?: "none" | "sm" | "md" | "pill";
  border?: "none" | "left" | "all";
}

export type OfferBlock =
  | { id: string; type: "stack"; children: OfferBlock[]; style?: BlockStyle }
  | { id: string; type: "columns"; columns: OfferBlock[][]; style?: BlockStyle }
  | { id: string; type: "text"; text: string; style?: BlockStyle }
  | { id: string; type: "field"; fieldId: CatalogFieldId; label?: string; style?: BlockStyle }
  | { id: string; type: "itemsTable"; columns: ItemsColumnId[]; style?: BlockStyle }
  | { id: string; type: "totals"; subtotal?: boolean; vat?: boolean; total?: boolean; priceRange?: boolean; style?: BlockStyle }
  | { id: string; type: "uspCards"; style?: BlockStyle }
  | { id: string; type: "customField"; key: string; label: string; style?: BlockStyle }
  | { id: string; type: "divider"; style?: BlockStyle }
  | { id: string; type: "spacer" };

export interface OfferCustomField {
  key: string;
  label: string;
}

export interface OfferDocument {
  blocks: OfferBlock[];
  customFields: OfferCustomField[];
}

/** [en, sk, hu] for the rail and for the bracketed sample on the review paper. */
const LABELS: Record<string, [string, string, string]> = {
  "company.name": ["Company name", "Názov firmy", "Cégnév"],
  "company.subtitle": ["Subtitle", "Podnázov", "Alcím"],
  "company.logo": ["Logo", "Logo", "Logó"],
  "company.street": ["Street", "Ulica", "Utca"],
  "company.city": ["City", "Mesto", "Város"],
  "company.postalCode": ["Postal code", "PSČ", "Irányítószám"],
  "company.country": ["Country", "Krajina", "Ország"],
  "company.companyId": ["Company ID", "IČO", "Cégjegyzékszám"],
  "company.taxId": ["Tax ID", "DIČ", "Adószám"],
  "company.vatId": ["VAT ID", "IČ DPH", "ÁFA-szám"],
  "company.email": ["Email", "E-mail", "E-mail"],
  "company.phone": ["Phone", "Telefón", "Telefon"],
  "company.phoneSecondary": ["Second phone", "Druhý telefón", "Második telefon"],
  "company.website": ["Website", "Web", "Weboldal"],
  "company.iban": ["IBAN", "IBAN", "IBAN"],
  "company.swift": ["SWIFT", "SWIFT", "SWIFT"],
  "company.bankName": ["Bank", "Banka", "Bank"],
  "company.socialProof": ["References", "Referencie", "Referenciák"],
  "offer.documentNumber": ["Document number", "Číslo dokladu", "Bizonylatszám"],
  "offer.title": ["Title", "Názov", "Cím"],
  "offer.subject": ["Subject", "Predmet", "Tárgy"],
  "offer.location": ["Location", "Lokalita", "Helyszín"],
  "offer.issuedAt": ["Issue date", "Dátum vystavenia", "Kiállítás dátuma"],
  "offer.validUntil": ["Valid until", "Platná do", "Érvényes eddig"],
  "offer.clientName": ["Client name", "Názov klienta", "Ügyfél neve"],
  "offer.clientEmail": ["Client email", "E-mail klienta", "Ügyfél e-mail"],
  "offer.clientPhone": ["Client phone", "Telefón klienta", "Ügyfél telefon"],
  "offer.clientStreet": ["Client street", "Ulica klienta", "Ügyfél utcája"],
  "offer.clientCity": ["Client city", "Mesto klienta", "Ügyfél városa"],
  "offer.clientPostalCode": ["Client postal code", "PSČ klienta", "Ügyfél irányítószáma"],
  "offer.clientCountry": ["Client country", "Krajina klienta", "Ügyfél országa"],
  "offer.clientIco": ["Client company ID", "IČO klienta", "Ügyfél cégjegyzékszáma"],
  "offer.clientDic": ["Client tax ID", "DIČ klienta", "Ügyfél adószáma"],
  "offer.clientIcdph": ["Client VAT ID", "IČ DPH klienta", "Ügyfél ÁFA-száma"],
  "offer.greetingNote": ["Greeting", "Oslovenie", "Megszólítás"],
  "offer.introNote": ["Introduction", "Úvod", "Bevezető"],
  "offer.reassuranceNote": ["Reassurance", "Uistenie", "Megerősítés"],
  "offer.nextStepsNote": ["Next steps", "Ďalšie kroky", "Következő lépések"],
  "offer.closingNote": ["Closing", "Záver", "Zárás"],
  "offer.signOffTeam": ["Sign-off", "Podpis", "Aláírás"],
  "offer.durationText": ["Duration", "Trvanie", "Időtartam"],
  "offer.startDateText": ["Start", "Začiatok", "Kezdés"],
  "offer.warrantyText": ["Warranty", "Záruka", "Garancia"],
  "offer.items": ["Price table", "Tabuľka cien", "Tételtáblázat"],
  "offer.totals": ["Totals", "Súčty", "Összesítés"],
  "offer.uspCards": ["Benefits", "Výhody", "Előnyök"]
};

const ITEM_LABELS: Record<ItemsColumnId, [string, string, string]> = {
  name: ["Item", "Položka", "Tétel"],
  description: ["Description", "Popis", "Leírás"],
  quantity: ["Qty", "Mn.", "Menny."],
  unit: ["Unit", "Jedn.", "Egys."],
  unitPrice: ["Unit price", "Cena", "Egységár"],
  vatRate: ["VAT", "DPH", "ÁFA"],
  discountPct: ["Discount", "Zľava", "Kedvezmény"],
  totalPrice: ["Total", "Spolu", "Összesen"]
};

type Lang = "en" | "sk" | "hu";

const pick = (row: [string, string, string] | undefined, lang: Lang, fallback: string) =>
  !row ? fallback : lang === "sk" ? row[1] : lang === "hu" ? row[2] : row[0];

export const fieldLabel = (id: string, lang: Lang): string => pick(LABELS[id], lang, id);

export const itemColumnLabel = (id: ItemsColumnId, lang: Lang): string => pick(ITEM_LABELS[id], lang, id);

/** Same prefix check as `ccrm_pdf_tpl_read_sample`: a sample uploaded for this feature, nothing else. */
export const isSamplePdfUrl = (url: unknown): url is string =>
  typeof url === "string"
  && /^\/uploads\/custom-template-pdf_[^/\\]+\.pdf$/i.test(url)
  && !url.includes("..");

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | undefined =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

const optionalColor = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const got = safeColor(value, "");
  return got === "" ? undefined : got;
};

const readStyle = (raw: unknown): BlockStyle | undefined => {
  if (!isPlain(raw)) return undefined;
  const style: BlockStyle = {};
  const color = optionalColor(raw.color);
  const background = optionalColor(raw.background);
  const borderColor = optionalColor(raw.borderColor);
  if (color) style.color = color;
  if (background) style.background = background;
  if (borderColor) style.borderColor = borderColor;
  const fontSize = oneOf(["sm", "md", "lg", "xl", "title"] as const, raw.fontSize);
  const weight = oneOf(["regular", "medium", "bold"] as const, raw.weight);
  const align = oneOf(["left", "center", "right"] as const, raw.align);
  const radius = oneOf(["none", "sm", "md", "pill"] as const, raw.radius);
  const border = oneOf(["none", "left", "all"] as const, raw.border);
  if (fontSize) style.fontSize = fontSize;
  if (weight) style.weight = weight;
  if (align) style.align = align;
  if (radius) style.radius = radius;
  if (border) style.border = border;
  return Object.keys(style).length ? style : undefined;
};

const stripTags = (s: string) => s.replace(/<[^>]*>/g, "");

const oneLine = (value: unknown, max = 90): string => {
  if (typeof value !== "string") return "";
  return stripTags(value).replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
};

const plainText = (value: unknown, max: number): string => {
  if (typeof value !== "string") return "";
  return stripTags(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
};

type Loose = Record<string, unknown>;

interface BuildCtx {
  items: boolean;
  totals: boolean;
  usp: boolean;
  keys: Set<string>;
  customFields: OfferCustomField[];
}

const countRaw = (value: unknown): number => {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countRaw(v), 0);
  if (!isPlain(value) || typeof value.type !== "string") return 0;
  let n = 1;
  if (value.type === "stack") n += countRaw(value.children);
  else if (value.type === "columns") n += countRaw(value.columns);
  return n;
};

const withStyle = (block: Loose, style: BlockStyle | undefined): Loose =>
  style ? { ...block, style } : block;

const accept = (node: unknown, depth: number, inColumn: boolean, ctx: BuildCtx): Loose | null => {
  if (depth > MAX_DEPTH || !isPlain(node) || typeof node.type !== "string") return null;
  const style = readStyle(node.style);
  switch (node.type) {
    case "text": {
      const text = plainText(node.text, 2000);
      if (!text) return null;
      return withStyle({ type: "text", text }, style);
    }
    case "field": {
      if (typeof node.fieldId !== "string" || !CATALOG_SET.has(node.fieldId)) return null;
      const label = oneLine(node.label);
      return withStyle({ type: "field", fieldId: node.fieldId, ...(label ? { label } : {}) }, style);
    }
    case "customField": {
      if (typeof node.key !== "string" || !KEY.test(node.key)) return null;
      if (!ctx.keys.has(node.key)) {
        if (ctx.keys.size >= MAX_CUSTOM) return null;
        const label = oneLine(node.label) || node.key;
        ctx.keys.add(node.key);
        ctx.customFields.push({ key: node.key, label });
      }
      const known = ctx.customFields.find(f => f.key === node.key);
      return withStyle({ type: "customField", key: node.key, label: known?.label || node.key }, style);
    }
    case "itemsTable": {
      if (ctx.items) return null;
      ctx.items = true;
      const picked: ItemsColumnId[] = [];
      if (Array.isArray(node.columns)) {
        for (const col of node.columns) {
          if (typeof col === "string" && ITEM_SET.has(col) && !picked.includes(col as ItemsColumnId)) {
            picked.push(col as ItemsColumnId);
          }
        }
      }
      return withStyle({ type: "itemsTable", columns: picked.length ? picked : [...DEFAULT_ITEM_COLUMNS] }, style);
    }
    case "totals": {
      if (ctx.totals) return null;
      const flags: Loose = {};
      for (const key of ["subtotal", "vat", "total", "priceRange"] as const) {
        if (node[key] === true) flags[key] = true;
      }
      if (!Object.keys(flags).length) return null;
      ctx.totals = true;
      return withStyle({ type: "totals", ...flags }, style);
    }
    case "uspCards": {
      if (ctx.usp) return null;
      ctx.usp = true;
      return withStyle({ type: "uspCards" }, style);
    }
    case "divider":
      return withStyle({ type: "divider" }, style);
    case "spacer":
      return { type: "spacer" };
    case "stack": {
      if (!Array.isArray(node.children)) return null;
      const children = node.children
        .map(child => accept(child, depth + 1, inColumn, ctx))
        .filter((child): child is Loose => child !== null);
      if (!children.length) return null;
      return withStyle({ type: "stack", children }, style);
    }
    case "columns": {
      if (inColumn || !Array.isArray(node.columns) || node.columns.length < 2 || node.columns.length > 3) return null;
      const columns: Loose[][] = [];
      for (const col of node.columns) {
        if (!Array.isArray(col)) continue;
        const kids = col
          .map(child => accept(child, depth + 1, true, ctx))
          .filter((child): child is Loose => child !== null);
        if (kids.length) columns.push(kids);
      }
      if (columns.length < 2 || columns.length > 3) return null;
      return withStyle({ type: "columns", columns }, style);
    }
    default:
      return null;
  }
};

const stamp = (nodes: Loose[]): OfferBlock[] => {
  let n = 1;
  const walk = (block: Loose): OfferBlock => {
    const id = `b${n++}`;
    if (block.type === "stack") {
      return { ...(block as object), id, children: (block.children as Loose[]).map(walk) } as OfferBlock;
    }
    if (block.type === "columns") {
      return {
        ...(block as object),
        id,
        columns: (block.columns as Loose[][]).map(col => col.map(walk))
      } as OfferBlock;
    }
    return { ...(block as object), id } as OfferBlock;
  };
  return nodes.map(walk);
};

/**
 * `null` means the payload cannot be a template: more than 80 blocks, or
 * nothing left once unknown types, foreign fields and illegal nesting are gone.
 */
export const normalizeOfferDocument = (raw: unknown): OfferDocument | null => {
  if (!isPlain(raw) || !Array.isArray(raw.blocks)) return null;
  if (countRaw(raw.blocks) > MAX_BLOCKS) return null;
  const ctx: BuildCtx = { items: false, totals: false, usp: false, keys: new Set(), customFields: [] };
  if (Array.isArray(raw.customFields)) {
    for (const entry of raw.customFields) {
      if (!isPlain(entry) || typeof entry.key !== "string" || !KEY.test(entry.key)) continue;
      if (ctx.keys.has(entry.key) || ctx.keys.size >= MAX_CUSTOM) continue;
      ctx.keys.add(entry.key);
      ctx.customFields.push({ key: entry.key, label: oneLine(entry.label) || entry.key });
    }
  }
  const blocks = raw.blocks
    .map(block => accept(block, 1, false, ctx))
    .filter((block): block is Loose => block !== null);
  if (!blocks.length) return null;
  const stamped = stamp(blocks);
  if (countRaw(stamped) > MAX_BLOCKS) return null;
  return { blocks: stamped, customFields: ctx.customFields };
};

const walk = (blocks: OfferBlock[], visit: (block: OfferBlock) => void) => {
  for (const block of blocks) {
    visit(block);
    if (block.type === "stack") walk(block.children, visit);
    else if (block.type === "columns") for (const col of block.columns) walk(col, visit);
  }
};

/** Computed from the blocks. Any `unplacedFields` the model sent are ignored. */
export const diffTemplateFields = (doc: OfferDocument | null): { missing: string[]; extracted: OfferCustomField[] } => {
  const used = new Set<string>();
  if (doc) {
    walk(doc.blocks, block => {
      if (block.type === "field") used.add(block.fieldId);
      else if (block.type === "itemsTable") used.add("offer.items");
      else if (block.type === "totals") used.add("offer.totals");
      else if (block.type === "uspCards") used.add("offer.uspCards");
    });
  }
  const missing = [...CATALOG_FIELDS, ...SYNTHETIC_FIELDS].filter(id => !used.has(id));
  return { missing, extracted: doc?.customFields ?? [] };
};

/** Cap 24 keys, 500 characters, strings only. Anything else is dropped. */
export const normalizeCustomFieldValues = (raw: unknown): Record<string, string> => {
  if (!isPlain(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_CUSTOM) break;
    if (!KEY.test(key) || typeof value !== "string") continue;
    out[key] = value.slice(0, 500);
  }
  return out;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const findParent = (blocks: OfferBlock[], id: string): { list: OfferBlock[]; index: number } | null => {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { list: blocks, index: i };
    const block = blocks[i];
    if (block.type === "stack") {
      const hit = findParent(block.children, id);
      if (hit) return hit;
    } else if (block.type === "columns") {
      for (const col of block.columns) {
        const hit = findParent(col, id);
        if (hit) return hit;
      }
    }
  }
  return null;
};

export const nextBlockId = (doc: OfferDocument): string => {
  let max = 0;
  walk(doc.blocks, block => {
    const match = /^b(\d+)$/.exec(block.id);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `b${max + 1}`;
};

export const blockForCatalogId = (id: string, blockId: string): OfferBlock | null => {
  if (id === "offer.items") return { id: blockId, type: "itemsTable", columns: [...DEFAULT_ITEM_COLUMNS] };
  if (id === "offer.totals") return { id: blockId, type: "totals", total: true };
  if (id === "offer.uspCards") return { id: blockId, type: "uspCards" };
  if (CATALOG_SET.has(id)) return { id: blockId, type: "field", fieldId: id as CatalogFieldId };
  return null;
};

export const removeBlock = (doc: OfferDocument, id: string): OfferDocument => {
  const copy = clone(doc);
  const hit = findParent(copy.blocks, id);
  if (hit) hit.list.splice(hit.index, 1);
  return copy;
};

/** Move a block to a root-level index. Drop slots on the paper use this. */
export const relocateBlock = (doc: OfferDocument, id: string, rootIndex: number): OfferDocument => {
  const copy = clone(doc);
  const hit = findParent(copy.blocks, id);
  if (!hit) return doc;
  const [block] = hit.list.splice(hit.index, 1);
  let index = rootIndex;
  if (hit.list === copy.blocks && hit.index < index) index -= 1;
  index = Math.max(0, Math.min(index, copy.blocks.length));
  copy.blocks.splice(index, 0, block);
  return copy;
};

export const insertBlock = (doc: OfferDocument, block: OfferBlock, index?: number): OfferDocument => {
  const copy = clone(doc);
  const at = index === undefined ? copy.blocks.length : Math.max(0, Math.min(index, copy.blocks.length));
  copy.blocks.splice(at, 0, block);
  return copy;
};

export const replaceBlock = (doc: OfferDocument, id: string, block: OfferBlock): OfferDocument => {
  const copy = clone(doc);
  const hit = findParent(copy.blocks, id);
  if (hit) hit.list[hit.index] = block;
  return copy;
};

export const moveSibling = (doc: OfferDocument, id: string, dir: -1 | 1): OfferDocument => {
  const copy = clone(doc);
  const hit = findParent(copy.blocks, id);
  if (!hit) return doc;
  const next = hit.index + dir;
  if (next < 0 || next >= hit.list.length) return doc;
  const [block] = hit.list.splice(hit.index, 1);
  hit.list.splice(next, 0, block);
  return copy;
};

export const setBlockText = (doc: OfferDocument, id: string, text: string): OfferDocument => {
  const copy = clone(doc);
  const hit = findParent(copy.blocks, id);
  const block = hit?.list[hit.index];
  if (block && block.type === "text") block.text = text.slice(0, 2000);
  return copy;
};

export const findBlock = (doc: OfferDocument, id: string): OfferBlock | null => {
  let found: OfferBlock | null = null;
  walk(doc.blocks, block => {
    if (block.id === id) found = block;
  });
  return found;
};

export const customBlocks = (doc: OfferDocument, key: string): OfferBlock[] => {
  const found: OfferBlock[] = [];
  walk(doc.blocks, block => {
    if (block.type === "customField" && block.key === key) found.push(block);
  });
  return found;
};

/** Drop the key, and every block that was showing it. */
export const discardCustomField = (doc: OfferDocument, key: string): OfferDocument => {
  const copy = clone(doc);
  const drop = (blocks: OfferBlock[]): OfferBlock[] => {
    const kept: OfferBlock[] = [];
    for (const block of blocks) {
      if (block.type === "customField" && block.key === key) continue;
      if (block.type === "stack") kept.push({ ...block, children: drop(block.children) });
      else if (block.type === "columns") kept.push({ ...block, columns: block.columns.map(drop) });
      else kept.push(block);
    }
    return kept;
  };
  copy.blocks = drop(copy.blocks);
  copy.customFields = copy.customFields.filter(field => field.key !== key);
  return copy;
};

export const forgetCustomKey = (doc: OfferDocument, key: string): OfferDocument => ({
  ...doc,
  customFields: doc.customFields.filter(field => field.key !== key)
});
