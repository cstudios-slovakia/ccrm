import { statSync } from "node:fs";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";

// PostCSS re-imports *this* file with a cache-busting query on every dev-server
// restart, but a plain `import darkPalette from "./scripts/postcss-dark-palette.mjs"`
// would still resolve to the copy Node cached the first time the server booted.
// The effect was that editing the dark-mode plugin changed nothing on screen —
// index.css recompiled on save, through last boot's plugin — until someone
// killed `npm run dev` entirely. Keying the import on the file's mtime makes a
// restart pick up the current source. The restart itself comes from the
// ccrm:watch-postcss-dark-palette plugin in vite.config.ts.
const darkPaletteUrl = new URL("./scripts/postcss-dark-palette.mjs", import.meta.url);
const { default: darkPalette } = await import(
  `${darkPaletteUrl.href}?mtime=${statSync(darkPaletteUrl).mtimeMs}`
);

export default {
  plugins: [
    tailwindcss(),
    // Must run after Tailwind: it reads the utilities Tailwind has just
    // generated and derives the dark-mode overrides from them, so dark mode
    // covers markup written after today with nothing to maintain by hand.
    // See scripts/postcss-dark-palette.mjs for the whole argument.
    darkPalette(),
    autoprefixer(),
  ],
}
