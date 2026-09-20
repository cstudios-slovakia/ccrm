export type TimePhaseId = 'dawn' | 'day' | 'sunset' | 'night';

export interface LoginPhaseConfig {
  id: TimePhaseId;
  badge: { en: string; sk: string; hu: string };
  greeting: { en: string; sk: string; hu: string };
  subtitle: { en: string; sk: string; hu: string };
  quote: { en: string; sk: string; hu: string };
  raysColor: string;
  raysSpeed: number;
  lightSpread: number;
  rayLength: number;
  pulsating?: boolean;
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
    badge: {
      en: 'Dawn Glow',
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
    backgroundGradient: 'linear-gradient(135deg, #120c1d 0%, #20132e 40%, #291836 75%, #150d22 100%)',
    bgClass: 'bg-[#120c1d]',
    accentGradient: 'from-amber-400 via-orange-400 to-rose-400',
    badgeClass: 'border-amber-400/30 bg-amber-500/10 text-amber-300 shadow-amber-500/10',
    cardBorderClass: 'border-amber-500/20',
    cardGlowClass: 'shadow-amber-500/10',
    blobColors: {
      blob1: 'bg-amber-500/15',
      blob2: 'bg-rose-500/15',
      blob3: 'bg-orange-400/15'
    },
    chipStyle: {
      bg: 'bg-amber-950/30',
      border: 'border-amber-500/20',
      text: 'text-amber-200',
      dot: 'bg-amber-400'
    },
    icon: 'sunrise',
    isLight: false
  },
  day: {
    id: 'day',
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
    backgroundGradient: 'linear-gradient(135deg, #E6F2FF 0%, #B3D9FF 45%, #80B3FF 80%, #6699E6 100%)',
    bgClass: 'bg-[#E6F2FF]',
    accentGradient: 'from-blue-700 via-indigo-700 to-sky-600',
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
    badge: {
      en: 'Golden Dusk',
      sk: 'Západ slnka',
      hu: 'Aranyalkonyat'
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
    raysColor: '#fb923c',
    raysSpeed: 0.85,
    lightSpread: 1.6,
    rayLength: 3.0,
    pulsating: false,
    backgroundGradient: 'linear-gradient(135deg, #18091f 0%, #290f2f 45%, #210a28 80%, #100615 100%)',
    bgClass: 'bg-[#18091f]',
    accentGradient: 'from-amber-400 via-rose-400 to-fuchsia-400',
    badgeClass: 'border-rose-400/30 bg-rose-500/10 text-rose-300 shadow-rose-500/10',
    cardBorderClass: 'border-rose-500/20',
    cardGlowClass: 'shadow-rose-500/10',
    blobColors: {
      blob1: 'bg-rose-500/15',
      blob2: 'bg-orange-500/15',
      blob3: 'bg-fuchsia-600/15'
    },
    chipStyle: {
      bg: 'bg-rose-950/30',
      border: 'border-rose-500/20',
      text: 'text-rose-200',
      dot: 'bg-rose-400'
    },
    icon: 'sunset'
  },
  night: {
    id: 'night',
    badge: {
      en: 'Midnight Guard',
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
    raysColor: '#818cf8',
    raysSpeed: 0.75,
    lightSpread: 1.3,
    rayLength: 2.8,
    pulsating: true,
    backgroundGradient: 'linear-gradient(135deg, #05060f 0%, #0a0d1f 50%, #060814 100%)',
    bgClass: 'bg-[#05060f]',
    accentGradient: 'from-indigo-400 via-purple-400 to-violet-400',
    badgeClass: 'border-indigo-400/30 bg-indigo-500/10 text-indigo-300 shadow-indigo-500/10',
    cardBorderClass: 'border-indigo-500/20',
    cardGlowClass: 'shadow-indigo-500/10',
    blobColors: {
      blob1: 'bg-indigo-600/15',
      blob2: 'bg-violet-600/15',
      blob3: 'bg-purple-500/15'
    },
    chipStyle: {
      bg: 'bg-indigo-950/30',
      border: 'border-indigo-500/20',
      text: 'text-indigo-200',
      dot: 'bg-indigo-400'
    },
    icon: 'moon'
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
