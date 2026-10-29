/**
 * Strings of the native WhatsApp module, in the CRM's three languages. The module reads the CRM's
 * language; there is no separate WAAI language switch. Wording follows WAAI's own dictionaries
 * (`apps/web/src/i18n/dictionaries`) where a string exists there, so the two UIs say the same thing.
 */

export type WaLang = "en" | "sk" | "hu";

const en = {
  title: "WhatsApp",
  subtitle: "Chats, summaries and tasks from your WhatsApp",
  tabs: { chats: "Chats", digest: "Digest", tasks: "Tasks", ask: "Ask", settings: "Settings" },
  account: {
    none: "No WhatsApp account linked",
    connected: "Connected",
    connecting: "Connecting",
    waitingForQr: "Waiting for QR scan",
    disconnected: "Disconnected",
    several: (n: number) => `${n} accounts`,
  },
  openStandalone: "Open in a new tab",
  tryAgain: "Try again",
  connecting: "Opening WhatsApp…",
  notConfigured: {
    title: "WhatsApp is not connected yet",
    admin: "Create the sign-in secret in Settings → Integrations → WhatsApp (WAAI).",
    member: "Ask an administrator to connect it.",
    openSettings: "Open the settings",
  },
  notLinked: {
    title: "Your account is not linked to WAAI",
    body: "Ask the WAAI administrator to link your CRM user in WAAI → Settings → CRM.",
  },
  needsUpdate: {
    title: "WhatsApp needs an update",
    admin: (crm: number, waai: number) =>
      `This CRM speaks version ${crm} of the WhatsApp API and WAAI speaks version ${waai}. Update the older of the two.`,
    member: "Ask an administrator to update WhatsApp.",
  },
  wasNotReady: {
    title: "WhatsApp is not ready",
    admin: "WAAI has no sign-in secret yet. Set CCRM_SSO_SECRET (and CCRM_ORIGIN) in WAAI's environment, using the secret from Settings → Integrations → WhatsApp (WAAI).",
    member: "WAAI is not set up for sign-in yet. Ask an administrator.",
  },
  forbidden: {
    title: "You cannot open WhatsApp",
    body: "Your role has no access to the WhatsApp module.",
  },
  unreachable: {
    title: "WhatsApp did not open",
    body: "WAAI did not answer, or it is not reachable from this address. Try again in a moment.",
    tooMany: "Too many sign-in attempts. Try again in a minute.",
  },
  comingSoon: {
    title: "Not available in this interface yet",
    body: (tab: string) => `The ${tab} tab arrives in an upcoming update. The previous interface still has it.`,
    switchBack: "Change the interface",
  },
};

export type WaMessages = typeof en;

const sk: WaMessages = {
  title: "WhatsApp",
  subtitle: "Chaty, súhrny a úlohy z vášho WhatsAppu",
  tabs: { chats: "Chaty", digest: "Súhrn", tasks: "Úlohy", ask: "Opýtať sa", settings: "Nastavenia" },
  account: {
    none: "Nie je prepojený žiadny účet WhatsApp",
    connected: "Pripojený",
    connecting: "Pripájanie",
    waitingForQr: "Čaká na naskenovanie QR",
    disconnected: "Odpojený",
    several: (n) => (n < 5 ? `${n} účty` : `${n} účtov`),
  },
  openStandalone: "Otvoriť v novej karte",
  tryAgain: "Skúsiť znova",
  connecting: "Otváram WhatsApp…",
  notConfigured: {
    title: "WhatsApp ešte nie je pripojený",
    admin: "Vytvorte prihlasovací kľúč v Nastavenia → Integrácie → WhatsApp (WAAI).",
    member: "Požiadajte administrátora, aby ho pripojil.",
    openSettings: "Otvoriť nastavenia",
  },
  notLinked: {
    title: "Váš účet nie je prepojený s WAAI",
    body: "Požiadajte správcu WAAI, aby prepojil vášho používateľa CRM v WAAI → Nastavenia → CRM.",
  },
  needsUpdate: {
    title: "WhatsApp potrebuje aktualizáciu",
    admin: (crm, waai) => `Toto CRM používa verziu ${crm} rozhrania WhatsApp a WAAI verziu ${waai}. Aktualizujte staršie z nich.`,
    member: "Požiadajte administrátora o aktualizáciu WhatsAppu.",
  },
  wasNotReady: {
    title: "WhatsApp nie je pripravený",
    admin: "WAAI ešte nemá prihlasovací kľúč. Nastavte CCRM_SSO_SECRET (a CCRM_ORIGIN) v prostredí WAAI podľa kľúča z Nastavenia → Integrácie → WhatsApp (WAAI).",
    member: "WAAI ešte nie je pripravená na prihlasovanie. Požiadajte administrátora.",
  },
  forbidden: {
    title: "WhatsApp nemôžete otvoriť",
    body: "Vaša rola nemá prístup k modulu WhatsApp.",
  },
  unreachable: {
    title: "WhatsApp sa neotvoril",
    body: "WAAI neodpovedá alebo nie je dostupná z tejto adresy. Skúste to o chvíľu znova.",
    tooMany: "Príliš veľa pokusov o prihlásenie. Skúste to o minútu.",
  },
  comingSoon: {
    title: "V tomto rozhraní zatiaľ nie je",
    body: (tab) => `Karta ${tab} pribudne v ďalšej aktualizácii. Predchádzajúce rozhranie ju ešte má.`,
    switchBack: "Zmeniť rozhranie",
  },
};

const hu: WaMessages = {
  title: "WhatsApp",
  subtitle: "Csevegések, összegzések és feladatok a WhatsAppból",
  tabs: { chats: "Csevegések", digest: "Összegzés", tasks: "Feladatok", ask: "Kérdezz", settings: "Beállítások" },
  account: {
    none: "Nincs összekapcsolt WhatsApp-fiók",
    connected: "Csatlakoztatva",
    connecting: "Csatlakozás",
    waitingForQr: "QR-kód beolvasására vár",
    disconnected: "Leválasztva",
    several: (n) => `${n} fiók`,
  },
  openStandalone: "Megnyitás új lapon",
  tryAgain: "Újra",
  connecting: "A WhatsApp megnyitása…",
  notConfigured: {
    title: "A WhatsApp még nincs csatlakoztatva",
    admin: "Hozza létre a belépési kulcsot a Beállítások → Integrációk → WhatsApp (WAAI) részben.",
    member: "Kérjen meg egy adminisztrátort a csatlakoztatására.",
    openSettings: "Beállítások megnyitása",
  },
  notLinked: {
    title: "A fiókja nincs összekapcsolva a WAAI-val",
    body: "Kérje meg a WAAI adminisztrátorát, hogy kösse össze a CRM-felhasználóját a WAAI → Beállítások → CRM részben.",
  },
  needsUpdate: {
    title: "A WhatsApp frissítést igényel",
    admin: (crm, waai) => `Ez a CRM a WhatsApp-felület ${crm}. verzióját használja, a WAAI a ${waai}. verziót. Frissítse a régebbit.`,
    member: "Kérjen meg egy adminisztrátort a WhatsApp frissítésére.",
  },
  wasNotReady: {
    title: "A WhatsApp még nem áll készen",
    admin: "A WAAI-nak még nincs belépési kulcsa. Állítsa be a CCRM_SSO_SECRET (és a CCRM_ORIGIN) értéket a WAAI környezetében a Beállítások → Integrációk → WhatsApp (WAAI) kulcsával.",
    member: "A WAAI még nincs felkészítve a bejelentkezésre. Kérdezze meg az adminisztrátort.",
  },
  forbidden: {
    title: "A WhatsApp nem nyitható meg",
    body: "A szerepköre nem fér hozzá a WhatsApp modulhoz.",
  },
  unreachable: {
    title: "A WhatsApp nem nyílt meg",
    body: "A WAAI nem válaszol, vagy erről a címről nem érhető el. Próbálja újra egy pillanat múlva.",
    tooMany: "Túl sok bejelentkezési kísérlet. Próbálja újra egy perc múlva.",
  },
  comingSoon: {
    title: "Ebben a felületen még nincs meg",
    body: (tab) => `A(z) ${tab} lap a következő frissítéssel érkezik. A korábbi felületen még megvan.`,
    switchBack: "Felület módosítása",
  },
};

const BY_LANG: Record<WaLang, WaMessages> = { en, sk, hu };

export function waMessages(lang: string): WaMessages {
  return BY_LANG[lang as WaLang] ?? en;
}
