import type { Lead, ProjectAttribute, ProjectAttributeType } from "../types";
import { isMoneyValueEmpty, parseMoneyValue } from "./currency.ts";
import { asAttributeList, isBooleanCheckbox, readChecklistValue } from "./projectColumns.ts";

export const VALID_ATTRIBUTE_TYPES: readonly ProjectAttributeType[] = [
  "textfield",
  "textarea",
  "select",
  "date",
  "time",
  "datetime",
  "number",
  "money",
  "checkbox",
  "radio",
  "files",
  "contact",
];

const OPTION_TYPES = new Set<ProjectAttributeType>(["select", "radio", "checkbox"]);

/** Normalizes the global `LEAD_ATTRIBUTES` array from settings or server payloads. */
export function normalizeLeadAttributes(raw: unknown): ProjectAttribute[] {
  if (!Array.isArray(raw)) return [];
  const out: ProjectAttribute[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    const rawType = typeof rec.type === "string" ? (rec.type as ProjectAttributeType) : "textfield";
    const type: ProjectAttributeType = (VALID_ATTRIBUTE_TYPES as readonly string[]).includes(rawType)
      ? rawType
      : "textfield";

    let options: string[] | undefined;
    if (OPTION_TYPES.has(type) && Array.isArray(rec.options)) {
      const cleaned = Array.from(
        new Set(rec.options.map(o => String(o ?? "").trim()).filter(Boolean)),
      );
      if (cleaned.length > 0 || type !== "checkbox") {
        options = cleaned;
      }
    }

    let requiredOptions: string[] | undefined;
    if (type === "checkbox" && options && Array.isArray(rec.requiredOptions)) {
      requiredOptions = Array.from(
        new Set(rec.requiredOptions.map(o => String(o ?? "").trim()).filter(o => options!.includes(o))),
      );
    }

    const required = type === "checkbox" ? false : !!rec.required;
    const normalized: ProjectAttribute = { id, name, type, required };
    if (options !== undefined) normalized.options = options;
    if (requiredOptions !== undefined && requiredOptions.length > 0) {
      normalized.requiredOptions = requiredOptions;
    } else if (type === "checkbox") {
      normalized.requiredOptions = [];
    }
    out.push(normalized);
  }

  return out;
}

/** True when a required custom field has no meaningful value yet. */
export function isLeadAttributeMissing(
  attr: ProjectAttribute,
  rawVal: unknown,
  defaultCurrency: string,
): boolean {
  if (!attr.required) return false;
  if (attr.type === "money") {
    return isMoneyValueEmpty(rawVal, defaultCurrency);
  }
  if (attr.type === "checkbox" && attr.options) {
    return readChecklistValue(rawVal).checked.length === 0;
  }
  if (attr.type === "files") {
    return asAttributeList(rawVal).length === 0;
  }
  return rawVal === "" || rawVal === null || rawVal === undefined || (Array.isArray(rawVal) && rawVal.length === 0);
}

/** True when a value stored in `lead.data[attr.id]` has user-supplied content. */
export function hasLeadAttributeValue(
  attr: ProjectAttribute,
  rawVal: unknown,
  defaultCurrency = "EUR",
): boolean {
  if (rawVal === null || rawVal === undefined || rawVal === "") return false;
  switch (attr.type) {
    case "money":
      return !isMoneyValueEmpty(rawVal, defaultCurrency);
    case "files":
      return asAttributeList(rawVal).length > 0;
    case "checkbox": {
      if (isBooleanCheckbox(attr)) return rawVal === true;
      const list = readChecklistValue(rawVal);
      return list.checked.length > 0 || list.extra.length > 0;
    }
    default:
      return String(rawVal).trim() !== "";
  }
}

/** Search matcher across configured Lead custom field values. */
export function leadMatchesCustomFieldQuery(
  lead: Pick<Lead, "data">,
  attributes: readonly ProjectAttribute[],
  rawQuery: string,
  resolveContactName?: (id: string) => string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query || attributes.length === 0 || !lead.data) return false;

  for (const attr of attributes) {
    const rawVal = lead.data[attr.id];
    if (rawVal === null || rawVal === undefined || rawVal === "") continue;

    switch (attr.type) {
      case "money": {
        if (isMoneyValueEmpty(rawVal, "EUR")) break;
        const m = parseMoneyValue(rawVal, "EUR");
        const txt = `${m.amount ?? ""} ${m.currency ?? ""}`.toLowerCase();
        if (txt.includes(query)) return true;
        break;
      }
      case "files": {
        const files = asAttributeList(rawVal);
        if (files.some(f => String(f?.name ?? "").toLowerCase().includes(query))) return true;
        break;
      }
      case "checkbox": {
        if (isBooleanCheckbox(attr)) break;
        const list = readChecklistValue(rawVal);
        if (
          list.checked.some(item => item.toLowerCase().includes(query)) ||
          list.extra.some(item => item.label.toLowerCase().includes(query))
        ) {
          return true;
        }
        break;
      }
      case "contact": {
        const idStr = String(rawVal);
        const resolved = resolveContactName ? resolveContactName(idStr) : "";
        if (resolved.toLowerCase().includes(query) || idStr.toLowerCase().includes(query)) {
          return true;
        }
        break;
      }
      default: {
        if (String(rawVal).toLowerCase().includes(query)) return true;
        break;
      }
    }
  }

  return false;
}

const cloneValue = (val: unknown): any => {
  if (Array.isArray(val)) return val.map(cloneValue);
  if (val && typeof val === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) out[k] = cloneValue(v);
    return out;
  }
  return val;
};

/**
 * Populates initial `Project.data` when converting a Lead into a Project:
 * 1. Built-in contact heuristics (email, phone, city, address/street, company/firma).
 * 2. Exact name + type match (or scalar-to-text fallback) from the Lead's configured
 *    custom fields (`lead.data`), taking precedence over generic heuristics.
 */
export function buildProjectDataFromLead(
  lead: Pick<Lead, "email" | "phone" | "city" | "address" | "companyId" | "data">,
  leadAttributes: readonly ProjectAttribute[],
  targetProjectAttributes: readonly ProjectAttribute[],
  defaultCurrency = "EUR",
): Record<string, any> {
  const dynamicData: Record<string, any> = {};

  for (const attr of targetProjectAttributes) {
    const attrNameLower = attr.name.toLowerCase();
    const attrIdLower = attr.id.toLowerCase();
    if (attrNameLower.includes("email") || attrIdLower.includes("email")) {
      dynamicData[attr.id] = lead.email || "";
    } else if (
      attrNameLower.includes("phone") ||
      attrIdLower.includes("phone") ||
      attrNameLower.includes("tel") ||
      attrIdLower.includes("tel")
    ) {
      dynamicData[attr.id] = lead.phone || "";
    } else if (attrNameLower.includes("city") || attrIdLower.includes("city")) {
      dynamicData[attr.id] = lead.city || "";
    } else if (
      attrNameLower.includes("address") ||
      attrIdLower.includes("address") ||
      attrNameLower.includes("street") ||
      attrIdLower.includes("street")
    ) {
      dynamicData[attr.id] = lead.address?.street || "";
    } else if (
      attrNameLower.includes("company") ||
      attrIdLower.includes("company") ||
      attrNameLower.includes("firma") ||
      attrIdLower.includes("firma")
    ) {
      dynamicData[attr.id] = lead.companyId || "";
    }
  }

  const leadData = lead.data || {};
  const leadAttrByKey = new Map<string, ProjectAttribute[]>();
  for (const la of leadAttributes) {
    const key = la.name.trim().toLowerCase();
    if (!key) continue;
    const list = leadAttrByKey.get(key) || [];
    list.push(la);
    leadAttrByKey.set(key, list);
  }

  for (const projAttr of targetProjectAttributes) {
    const key = projAttr.name.trim().toLowerCase();
    const candidates = leadAttrByKey.get(key);
    if (!candidates || candidates.length === 0) continue;

    // Prefer exact same field type; allow scalar-to-textfield/textarea fallback.
    let matched = candidates.find(la => la.type === projAttr.type && hasLeadAttributeValue(la, leadData[la.id], defaultCurrency));
    if (!matched && (projAttr.type === "textfield" || projAttr.type === "textarea")) {
      matched = candidates.find(la => {
        if (!hasLeadAttributeValue(la, leadData[la.id], defaultCurrency)) return false;
        const v = leadData[la.id];
        return typeof v === "string" || typeof v === "number";
      });
    }
    if (!matched) continue;

    const rawVal = leadData[matched.id];
    dynamicData[projAttr.id] = cloneValue(rawVal);
  }

  return dynamicData;
}
