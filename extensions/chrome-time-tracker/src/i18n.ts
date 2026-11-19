import { PRODUCT_NAME } from "../../../src/utils/brand.ts";

/** The popup speaks the browser's language: Slovak, Hungarian, else English. */
const language = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase();
const index = language.startsWith("sk") ? 1 : language.startsWith("hu") ? 2 : 0;

export const t = (en: string, sk: string, hu: string): string => [en, sk, hu][index];
export { PRODUCT_NAME };
