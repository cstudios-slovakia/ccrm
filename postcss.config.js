import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import darkPalette from "./scripts/postcss-dark-palette.mjs";

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
