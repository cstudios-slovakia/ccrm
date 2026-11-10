import type { Language } from "../../utils/translations";

/** Strings the shared menuEditStrings table does not have, only used by the mobile editor. */
export function mobileEditStrings(language: Language | string) {
  const l = language === "sk" || language === "hu" ? language : "en";
  const p = (en: string, sk: string, hu: string) => (l === "sk" ? sk : l === "hu" ? hu : en);
  return {
    back: p("Back", "Späť", "Vissza"),
    startScreenHint: p(
      "The module that opens after you sign in.",
      "Modul, ktorý sa otvorí po prihlásení.",
      "Az a modul, amely bejelentkezés után megnyílik."
    ),
  };
}
