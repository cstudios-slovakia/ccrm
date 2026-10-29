import assert from "node:assert/strict";
import test from "node:test";
import { getTranslation, type Language } from "./translations.ts";

test("settings.modules.toast keys are translated in all languages", () => {
  const languages: Language[] = ["en", "sk", "hu"];
  for (const lang of languages) {
    const visible = getTranslation(lang, "settings.modules.toast.visible");
    const hidden = getTranslation(lang, "settings.modules.toast.hidden");

    assert.notEqual(visible, "settings.modules.toast.visible", `Missing visible toast translation for ${lang}`);
    assert.notEqual(hidden, "settings.modules.toast.hidden", `Missing hidden toast translation for ${lang}`);
    assert.ok(visible.length > 0);
    assert.ok(hidden.length > 0);
  }
});
