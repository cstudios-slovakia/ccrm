export interface ThemeOption {
  id: string;
  name: { en: string; sk: string; hu: string };
  description: { en: string; sk: string; hu: string };
  icon: string;
  category: "herb" | "classic";
  preview: {
    bg: string;
    card: string;
    primary: string;
    secondary: string;
    text: string;
    border: string;
  };
}

export const HERB_THEMES: ThemeOption[] = [
  {
    id: "basic",
    name: {
      en: "Basic (Classic Soft)",
      sk: "Základná (Klasická Jemná)",
      hu: "Alapértelmezett (Klasszikus Lágy)"
    },
    description: {
      en: "Softer glassmorphism light theme with desaturated slate-indigo and muted terracotta accents.",
      sk: "Jemnejšia sklenená svetlá téma s tlmenými akcentmi bridlicovo-modrej a terakoty.",
      hu: "Lágyabb üveghatású világos téma visszafogott kék és terrakotta kiemelésekkel."
    },
    icon: "🌿",
    category: "classic",
    preview: {
      bg: "#f2f6fc",
      card: "#ffffff",
      primary: "#4f6edb",
      secondary: "#ea8a4c",
      text: "#1e293b",
      border: "#e2e8f0"
    }
  },
  {
    id: "sezame",
    name: {
      en: "Sezame (Warm Light)",
      sk: "Sezam (Teplá Svetlá)",
      hu: "Szezámmag (Meleg Világos)"
    },
    description: {
      en: "Feather-soft parchment cream background, gentle warm charcoal type, and muted toasted amber accents.",
      sk: "Aksamitne jemné pergamenové pozadie, príjemný teplý antracitový text a jemné akcenty praženého sézamu.",
      hu: "Bársonyosan lágy pergamen háttér, kellemes meleg faszén szöveg és finom pirított szezám akcentusok."
    },
    icon: "🌾",
    category: "herb",
    preview: {
      bg: "#faf7f2",
      card: "#fdfaf4",
      primary: "#c27803",
      secondary: "#5b930b",
      text: "#332f2b",
      border: "#ece4d5"
    }
  }
];

export const getStoredTheme = (): string => {
  if (typeof window === "undefined") return "basic";
  return localStorage.getItem("crm_user_theme") || "basic";
};

export const applyTheme = (themeId: string): void => {
  if (typeof document === "undefined") return;
  const validTheme = HERB_THEMES.some((t) => t.id === themeId) ? themeId : "basic";
  document.documentElement.setAttribute("data-theme", validTheme);
  localStorage.setItem("crm_user_theme", validTheme);
};
