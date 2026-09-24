export type TimePhaseId = 'dawn' | 'day' | 'sunset' | 'night';

export interface LoginShaderConfig {
  bg: string;
  u_high: [number, number, number];
  u_main: [number, number, number];
  u_mid: [number, number, number];
  u_low: [number, number, number];
  u_wind: number;
  u_warp: number;
  u_nscale: number;
}

export interface LoginPhaseConfig {
  id: TimePhaseId;
  name: string;
  badge: { en: string; sk: string; hu: string };
  greeting: { en: string; sk: string; hu: string };
  subtitle: { en: string; sk: string; hu: string };
  quote: { en: string; sk: string; hu: string };
  raysColor: string;
  raysSpeed: number;
  lightSpread: number;
  rayLength: number;
  pulsating?: boolean;
  shaderConfig: LoginShaderConfig;
  backgroundGradient: string;
  bgClass: string;
  accentGradient: string;
  badgeClass: string;
  cardBorderClass: string;
  cardGlowClass: string;
  blobColors: {
    blob1: string;
    blob2: string;
    blob3: string;
  };
  chipStyle: {
    bg: string;
    border: string;
    text: string;
    dot: string;
  };
  icon: 'sunrise' | 'sun' | 'sunset' | 'moon';
  isLight?: boolean;
}

export const LOGIN_PHASES: Record<TimePhaseId, LoginPhaseConfig> = {
  dawn: {
    id: 'dawn',
    name: 'Madder dusk',
    badge: {
      en: 'Madder Dawn',
      sk: 'Ranný úsvit',
      hu: 'Hajnali ragyogás'
    },
    greeting: {
      en: 'Good morning',
      sk: 'Dobré ráno',
      hu: 'Jó reggelt!'
    },
    subtitle: {
      en: 'Fresh momentum for today’s achievements',
      sk: 'Nový ranný impulz pre dnešné úspechy',
      hu: 'Friss reggeli lendület a mai sikerekhez'
    },
    quote: {
      en: 'Ignite your business vision and lead the market forward.',
      sk: 'Naštartujte svoju víziu a posuňte svoje podnikanie vpred.',
      hu: 'Nyisson teret új lehetőségeknek és valósítsa meg céljait.'
    },
    raysColor: '#fde68a',
    raysSpeed: 0.85,
    lightSpread: 1.5,
    rayLength: 3.2,
    pulsating: false,
    shaderConfig: {
      bg: '#FFE3C7',
      u_high: [1.0, 0.8902, 0.7804],
      u_main: [0.9490, 0.7216, 0.6275],
      u_mid: [0.7804, 0.4941, 0.6196],
      u_low: [0.4784, 0.3686, 0.6196],
      u_wind: 0.144,
      u_warp: 0.235,
      u_nscale: 0.8675
    },
    backgroundGradient: 'linear-gradient(135deg, #FFE3C7 0%, #F2B8A0 45%, #C77E9E 80%, #7A5E9E 100%)',
    bgClass: 'bg-[#FFE3C7]',
    accentGradient: 'from-rose-700 via-pink-700 to-amber-700',
    badgeClass: 'border-rose-300/40 bg-white/70 text-rose-950 shadow-rose-500/10 backdrop-blur-md',
    cardBorderClass: 'border-rose-300/40',
    cardGlowClass: 'shadow-rose-500/10',
    blobColors: {
      blob1: 'bg-rose-400/20',
      blob2: 'bg-amber-400/20',
      blob3: 'bg-fuchsia-400/15'
    },
    chipStyle: {
      bg: 'bg-white/70 backdrop-blur-md',
      border: 'border-rose-200/80',
      text: 'text-rose-950 font-bold',
      dot: 'bg-rose-600'
    },
    icon: 'sunrise',
    isLight: true
  },
  day: {
    id: 'day',
    name: 'Blue sky',
    badge: {
      en: 'Blue Sky Day',
      sk: 'Jasný modrý deň',
      hu: 'Kék égbolt nappal'
    },
    greeting: {
      en: 'Good day',
      sk: 'Dobrý deň',
      hu: 'Szép napot!'
    },
    subtitle: {
      en: 'High-velocity operations & team collaboration',
      sk: 'Vysokorýchlostná tímová spolupráca a riadenie',
      hu: 'Nagysebességű csapatmunka és hatékony irányítás'
    },
    quote: {
      en: 'Enterprise-grade precision powering every business milestone.',
      sk: 'Špičková presnosť poháňajúca každý dôležitý firemný míľnik.',
      hu: 'Csúcskategóriás precizitás minden vállalkozási mérföldkőhöz.'
    },
    raysColor: '#38bdf8',
    raysSpeed: 0.9,
    lightSpread: 1.6,
    rayLength: 3.8,
    pulsating: false,
    shaderConfig: {
      bg: '#E6F2FF',
      u_high: [0.902, 0.949, 1.0],
      u_main: [0.702, 0.851, 1.0],
      u_mid: [0.502, 0.702, 1.0],
      u_low: [0.400, 0.600, 0.902],
      u_wind: 0.144,
      u_warp: 0.235,
      u_nscale: 0.8675
    },
    backgroundGradient: 'linear-gradient(135deg, #E6F2FF 0%, #B3D9FF 45%, #80B3FF 80%, #6699E6 100%)',
    bgClass: 'bg-[#E6F2FF]',
    accentGradient: 'from-blue-950 via-indigo-900 to-blue-900',
    badgeClass: 'border-blue-400/40 bg-white/70 text-blue-900 shadow-blue-500/10 backdrop-blur-md',
    cardBorderClass: 'border-blue-300/40',
    cardGlowClass: 'shadow-blue-500/10',
    blobColors: {
      blob1: 'bg-blue-300/30',
      blob2: 'bg-sky-300/30',
      blob3: 'bg-indigo-300/25'
    },
    chipStyle: {
      bg: 'bg-white/70 backdrop-blur-md',
      border: 'border-blue-200/80',
      text: 'text-blue-950 font-bold',
      dot: 'bg-blue-600'
    },
    icon: 'sun',
    isLight: true
  },
  sunset: {
    id: 'sunset',
    name: 'Night sky',
    badge: {
      en: 'Twilight Dusk',
      sk: 'Večerný súmrak',
      hu: 'Esti szürkület'
    },
    greeting: {
      en: 'Good evening',
      sk: 'Dobrý večer',
      hu: 'Kellemes estét!'
    },
    subtitle: {
      en: 'Milestone review & executive summaries',
      sk: 'Zhodnotenie dňa a finálne schvaľovanie úloh',
      hu: 'Napi eredmények és vezetői összefoglalók'
    },
    quote: {
      en: 'Seal deals, finalize metrics, and celebrate today’s achievements.',
      sk: 'Uzatvorte dnešné dohody, zhodnoťte metriky a oslávte tímové víťazstvá.',
      hu: 'Zárja le a mai megállapodásokat és összegezze az elért sikereket.'
    },
    raysColor: '#818cf8',
    raysSpeed: 0.85,
    lightSpread: 1.6,
    rayLength: 3.0,
    pulsating: false,
    shaderConfig: {
      bg: '#1a2238',
      u_high: [0.7255, 0.7843, 0.9490],
      u_main: [0.4314, 0.4980, 0.7490],
      u_mid: [0.2902, 0.3529, 0.6275],
      u_low: [0.2000, 0.2510, 0.4314],
      u_wind: 0.144,
      u_warp: 0.235,
      u_nscale: 0.8675
    },
    backgroundGradient: 'linear-gradient(135deg, #12182b 0%, #1e284a 45%, #2d3b6b 80%, #0d1222 100%)',
    bgClass: 'bg-[#12182b]',
    accentGradient: 'from-indigo-300 via-purple-300 to-blue-200',
    badgeClass: 'border-indigo-400/30 bg-indigo-950/40 text-indigo-200 shadow-indigo-500/10 backdrop-blur-md',
    cardBorderClass: 'border-indigo-500/20',
    cardGlowClass: 'shadow-indigo-500/10',
    blobColors: {
      blob1: 'bg-indigo-600/15',
      blob2: 'bg-blue-600/15',
      blob3: 'bg-purple-600/15'
    },
    chipStyle: {
      bg: 'bg-indigo-950/40 backdrop-blur-md',
      border: 'border-indigo-400/20',
      text: 'text-indigo-100',
      dot: 'bg-indigo-400'
    },
    icon: 'sunset',
    isLight: false
  },
  night: {
    id: 'night',
    name: 'Storm light',
    badge: {
      en: 'Storm Midnight',
      sk: 'Nočný režim',
      hu: 'Éjszakai őrszem'
    },
    greeting: {
      en: 'Good night',
      sk: 'Dobrú noc',
      hu: 'Jó éjszakát!'
    },
    subtitle: {
      en: 'Secure telemetry & autonomous monitoring',
      sk: 'Bezpečná telemetria a nepretržitý monitoring',
      hu: 'Biztonságos telemetria és autonóm felügyelet'
    },
    quote: {
      en: 'Silent, ultra-secure data pipelines protecting your ecosystem 24/7.',
      sk: 'Tichá, špičkovo zabezpečená infraštruktúra chrániaca vaše dáta 24/7.',
      hu: 'Csendes, maximálisan védett infrastruktúra a nap 24 órájában.'
    },
    raysColor: '#94a3b8',
    raysSpeed: 0.75,
    lightSpread: 1.3,
    rayLength: 2.8,
    pulsating: true,
    shaderConfig: {
      bg: '#10141d',
      u_high: [0.9098, 0.9176, 0.9333],
      u_main: [0.7176, 0.7412, 0.7882],
      u_mid: [0.5490, 0.5765, 0.6431],
      u_low: [0.3490, 0.3843, 0.4510],
      u_wind: 0.144,
      u_warp: 0.235,
      u_nscale: 0.8675
    },
    backgroundGradient: 'linear-gradient(135deg, #0d1017 0%, #161c28 50%, #090c12 100%)',
    bgClass: 'bg-[#0d1017]',
    accentGradient: 'from-slate-200 via-sky-200 to-indigo-200',
    badgeClass: 'border-slate-400/30 bg-slate-900/50 text-slate-200 shadow-slate-500/10 backdrop-blur-md',
    cardBorderClass: 'border-slate-500/20',
    cardGlowClass: 'shadow-slate-500/10',
    blobColors: {
      blob1: 'bg-slate-600/15',
      blob2: 'bg-indigo-600/15',
      blob3: 'bg-sky-700/15'
    },
    chipStyle: {
      bg: 'bg-slate-900/50 backdrop-blur-md',
      border: 'border-slate-400/20',
      text: 'text-slate-100',
      dot: 'bg-slate-400'
    },
    icon: 'moon',
    isLight: false
  }
};

/**
 * Resolves the time phase from the hour of the day (0-23):
 * - Dawn: 05:00 - 08:59
 * - Day: 09:00 - 16:59
 * - Sunset: 17:00 - 20:59
 * - Night: 21:00 - 04:59
 */
export const getTimePhaseId = (date: Date = new Date()): TimePhaseId => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 21) return 'sunset';
  return 'night';
};

export const getLoginPhaseConfig = (phaseId: TimePhaseId): LoginPhaseConfig => {
  return LOGIN_PHASES[phaseId] || LOGIN_PHASES.day;
};

export const getCurrentLoginTheme = (
  date: Date = new Date(),
  overridePhase?: TimePhaseId
): LoginPhaseConfig => {
  const phaseId = overridePhase || getTimePhaseId(date);
  return getLoginPhaseConfig(phaseId);
};

export const formatLocalizedClock = (date: Date = new Date()): {
  hoursStr: string;
  minutesStr: string;
  secondsStr: string;
} => {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return { hoursStr: h, minutesStr: m, secondsStr: s };
};

export const formatLocalizedDate = (
  date: Date = new Date(),
  lang: 'en' | 'sk' | 'hu' = 'en'
): string => {
  try {
    const locale = lang === 'sk' ? 'sk-SK' : lang === 'hu' ? 'hu-HU' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  } catch {
    return date.toDateString();
  }
};
