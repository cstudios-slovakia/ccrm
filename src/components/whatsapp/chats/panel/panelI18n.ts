/**
 * Strings for the chat AI summary, tasks, task-update composer and CRM linking panel.
 * Available in English (en), Slovak (sk), and Hungarian (hu).
 */

export interface PanelTranslations {
  summary: {
    title: string;
    windows: {
      today: string;
      d3: string;
      d7: string;
      d30: string;
      recent: string;
      custom: string;
    };
    from: string;
    to: string;
    customHint: string;
    generate: string;
    regenerate: string;
    generating: string;
    language: string;
    languages: {
      en: string;
      sk: string;
      hu: string;
    };
    listen: string;
    pause: string;
    loadingAudio: string;
    audioError: string;
    speed: string;
    noMessages: string;
    loading: string;
    failed: string;
    actionItems: string;
    viewTasks: string;
    cachedAgo: (mins: number, count: number) => string;
  };
  tasks: {
    title: string;
    filters: {
      open: string;
      completed: string;
      all: string;
    };
    noTasks: string;
    allCaughtUp: string;
    reportDone: string;
    markDone: string;
    markOpen: string;
    dueOn: (date: string) => string;
    assignee: (name: string) => string;
    attachments: string;
    download: string;
    closePreview: string;
    loading: string;
    failed: string;
    crmBadge: string;
    crmPending: string;
    crmError: string;
    crmGone: string;
    openInCrm: string;
    doneInCrm: string;
    linkedHint: string;
  };
  taskUpdate: {
    title: string;
    subtitle: string;
    selectTasks: string;
    noCompletedTasks: string;
    notesLabel: string;
    notesPlaceholder: string;
    attachFiles: string;
    removeFile: string;
    preview: string;
    language: string;
    sendUpdate: string;
    sending: string;
    success: string;
    cancel: string;
    tooManyFiles: string;
    fileTooLarge: string;
    offline: string;
    failed: string;
    partial: (n: number) => string;
  };
  crmLink: {
    title: string;
    chip: string;
    none: string;
    hint: string;
    ambiguousClient: (n: number) => string;
    ambiguousLead: (n: number) => string;
    linkedSection: string;
    candidatesSection: string;
    search: string;
    noResults: string;
    client: string;
    lead: string;
    project: string;
    auto: string;
    manual: string;
    unlink: string;
    link: string;
    openInCrm: string;
    failed: string;
  };
}

const en: PanelTranslations = {
  summary: {
    title: "AI Summary",
    windows: {
      today: "Today",
      d3: "3 days",
      d7: "7 days",
      d30: "30 days",
      recent: "Recent",
      custom: "Custom",
    },
    from: "From",
    to: "To",
    customHint: "Pick a date range to generate a summary.",
    generate: "Generate summary",
    regenerate: "Refresh summary",
    generating: "Generating summary…",
    language: "Summary language",
    languages: {
      en: "English",
      sk: "Slovenčina",
      hu: "Magyar",
    },
    listen: "Listen",
    pause: "Pause",
    loadingAudio: "Preparing audio…",
    audioError: "Audio could not be played.",
    speed: "Speed",
    noMessages: "No messages in this time window.",
    loading: "Loading summary…",
    failed: "Summary could not be generated. Please try again.",
    actionItems: "Action items",
    viewTasks: "View conversation tasks",
    cachedAgo: (mins, count) => `Generated ${mins} min ago · ${count} messages`,
  },
  tasks: {
    title: "Tasks",
    filters: {
      open: "Open",
      completed: "Completed",
      all: "All",
    },
    noTasks: "No tasks extracted for this conversation.",
    allCaughtUp: "You're all caught up!",
    reportDone: "Report tasks done",
    markDone: "Mark as completed",
    markOpen: "Mark as open",
    dueOn: (date) => `Due ${date}`,
    assignee: (name) => `Assignee: ${name}`,
    attachments: "Attachments",
    download: "Download",
    closePreview: "Close preview",
    loading: "Loading tasks…",
    failed: "Tasks could not be loaded.",
    crmBadge: "CRM",
    crmPending: "Sending to CRM…",
    crmError: "CRM sync error",
    crmGone: "Deleted in CRM",
    openInCrm: "Open in CRM",
    doneInCrm: "Done in CRM",
    linkedHint: "Linked to CRM task (cannot be modified here).",
  },
  taskUpdate: {
    title: "Report completed tasks",
    subtitle: "Send a formatted task update directly to this WhatsApp conversation.",
    selectTasks: "Select completed tasks to include in the report",
    noCompletedTasks: "No completed tasks available to report.",
    notesLabel: "Notes for this task (optional)",
    notesPlaceholder: "Add any context or remarks…",
    attachFiles: "Attach photos or documents",
    removeFile: "Remove file",
    preview: "WhatsApp message preview",
    language: "Message language",
    sendUpdate: "Send task update",
    sending: "Sending update…",
    success: "Task update successfully sent to the conversation.",
    cancel: "Cancel",
    tooManyFiles: "Maximum 10 attachments allowed.",
    fileTooLarge: "File exceeds 32 MB limit.",
    offline: "WhatsApp is offline. Reconnect your account to send.",
    failed: "The update could not be sent.",
    partial: (n) => `The message was sent, but ${n} attachment(s) failed.`,
  },
  crmLink: {
    title: "CRM links",
    chip: "CRM",
    none: "Link to CRM",
    hint: "Linked records link this chat in the CRM and attach its tasks.",
    ambiguousClient: (n) => `${n} clients share this number — choose one`,
    ambiguousLead: (n) => `${n} leads share this number — choose one`,
    linkedSection: "Linked records",
    candidatesSection: "Which one?",
    search: "Find a client, lead or project…",
    noResults: "Nothing found.",
    client: "Client",
    lead: "Lead",
    project: "Project",
    auto: "auto",
    manual: "manual",
    unlink: "Remove link",
    link: "Link",
    openInCrm: "Open in CRM",
    failed: "Could not update the link.",
  },
};

const sk: PanelTranslations = {
  summary: {
    title: "AI súhrn",
    windows: {
      today: "Dnes",
      d3: "3 dni",
      d7: "7 dní",
      d30: "30 dní",
      recent: "Nedávne",
      custom: "Vlastné",
    },
    from: "Od",
    to: "Do",
    customHint: "Vyberte časové obdobie pre vygenerovanie súhrnu.",
    generate: "Vytvoriť súhrn",
    regenerate: "Obnoviť súhrn",
    generating: "Generujem súhrn…",
    language: "Jazyk súhrnu",
    languages: {
      en: "English",
      sk: "Slovenčina",
      hu: "Magyar",
    },
    listen: "Prehrať",
    pause: "Pozastaviť",
    loadingAudio: "Pripravujem zvuk…",
    audioError: "Zvuk sa nepodarilo prehrať.",
    speed: "Rýchlosť",
    noMessages: "V tomto časovom období nie sú žiadne správy.",
    loading: "Načítavam súhrn…",
    failed: "Súhrn sa nepodarilo vytvoriť. Skúste znova.",
    actionItems: "Akčné body a úlohy",
    viewTasks: "Zobraziť úlohy konverzácie",
    cachedAgo: (mins, count) => `Vytvorené pred ${mins} min · ${count} správ`,
  },
  tasks: {
    title: "Úlohy",
    filters: {
      open: "Otvorené",
      completed: "Hotové",
      all: "Všetky",
    },
    noTasks: "Zatiaľ žiadne úlohy z tejto konverzácie.",
    allCaughtUp: "Všetko je hotové!",
    reportDone: "Nahlásiť hotové úlohy",
    markDone: "Označiť ako hotové",
    markOpen: "Označiť ako otvorené",
    dueOn: (date) => `Termín: ${date}`,
    assignee: (name) => `Zodpovedný: ${name}`,
    attachments: "Prílohy",
    download: "Stiahnuť",
    closePreview: "Zavrieť náhľad",
    loading: "Načítavam úlohy…",
    failed: "Úlohy sa nepodarilo načítať.",
    crmBadge: "CRM",
    crmPending: "Odosielam do CRM…",
    crmError: "Chyba CRM synchronizácie",
    crmGone: "Zmazané v CRM",
    openInCrm: "Otvoriť v CRM",
    doneInCrm: "Hotové v CRM",
    linkedHint: "Prepojené s úlohou v CRM (nemožno tu meniť).",
  },
  taskUpdate: {
    title: "Nahlásiť hotové úlohy",
    subtitle: "Odoslať formátovanú správu o dokončení úloh priamo do tejto WhatsApp konverzácie.",
    selectTasks: "Vyberte hotové úlohy, ktoré chcete zahrnúť do správy",
    noCompletedTasks: "Nie sú k dispozícii žiadne hotové úlohy na nahlásenie.",
    notesLabel: "Poznámka k úlohe (voliteľné)",
    notesPlaceholder: "Pridajte poznámku alebo podrobnosti…",
    attachFiles: "Priložiť fotky alebo dokumenty",
    removeFile: "Odstrániť súbor",
    preview: "Náhľad WhatsApp správy",
    language: "Jazyk správy",
    sendUpdate: "Odoslať správu",
    sending: "Odosielam správu…",
    success: "Správa o úlohách bola úspešne odoslaná do konverzácie.",
    cancel: "Zrušiť",
    tooManyFiles: "Najviac 10 príloh.",
    fileTooLarge: "Súbor presahuje limit 32 MB.",
    offline: "WhatsApp je offline. Pre odoslanie znova pripojte účet.",
    failed: "Správu sa nepodarilo odoslať.",
    partial: (n) => `Text bol odoslaný, ale ${n} prílohu/príloh sa nepodarilo odoslať.`,
  },
  crmLink: {
    title: "Prepojenia s CRM",
    chip: "CRM",
    none: "Prepojiť s CRM",
    hint: "Prepojené záznamy ukážu tento chat v CRM a priradia úlohy.",
    ambiguousClient: (n) => `Toto číslo má ${n} klientov — vyberte jedného`,
    ambiguousLead: (n) => `Toto číslo má ${n} leadov — vyberte jedného`,
    linkedSection: "Prepojené záznamy",
    candidatesSection: "Ktorý?",
    search: "Nájsť klienta, lead alebo projekt…",
    noResults: "Nič sa nenašlo.",
    client: "Klient",
    lead: "Lead",
    project: "Projekt",
    auto: "automaticky",
    manual: "ručne",
    unlink: "Zrušiť prepojenie",
    link: "Prepojiť",
    openInCrm: "Otvoriť v CRM",
    failed: "Prepojenie sa nepodarilo uložiť.",
  },
};

const hu: PanelTranslations = {
  summary: {
    title: "MI összegzés",
    windows: {
      today: "Ma",
      d3: "3 nap",
      d7: "7 nap",
      d30: "30 nap",
      recent: "Legutóbbi",
      custom: "Egyéni",
    },
    from: "Ettől",
    to: "Eddig",
    customHint: "Válasszon időtartományt az összegzéshez.",
    generate: "Összegzés készítése",
    regenerate: "Összegzés frissítése",
    generating: "Összegzés generálása…",
    language: "Összegzés nyelve",
    languages: {
      en: "English",
      sk: "Slovenčina",
      hu: "Magyar",
    },
    listen: "Meghallgatás",
    pause: "Szünet",
    loadingAudio: "Hang készítése…",
    audioError: "A hang lejátszása nem sikerült.",
    speed: "Sebesség",
    noMessages: "Nincsenek üzenetek ebben az időszakban.",
    loading: "Összegzés betöltése…",
    failed: "Nem sikerült legenerálni az összegzést.",
    actionItems: "Teendők és feladatok",
    viewTasks: "Csevegés feladatainak megtekintése",
    cachedAgo: (mins, count) => `${mins} perccel ezelőtt generálva · ${count} üzenet`,
  },
  tasks: {
    title: "Feladatok",
    filters: {
      open: "Nyitott",
      completed: "Kész",
      all: "Mind",
    },
    noTasks: "Nincsenek feladatok ebből a csevegésből.",
    allCaughtUp: "Minden feladat kész!",
    reportDone: "Kész feladatok jelentése",
    markDone: "Megjelölés készként",
    markOpen: "Megjelölés nyitottként",
    dueOn: (date) => `Határidő: ${date}`,
    assignee: (name) => `Felelős: ${name}`,
    attachments: "Mellékletek",
    download: "Letöltés",
    closePreview: "Előnézet bezárása",
    loading: "Feladatok betöltése…",
    failed: "A feladatokat nem sikerült betölteni.",
    crmBadge: "CRM",
    crmPending: "Küldés a CRM-be…",
    crmError: "CRM szinkronizálási hiba",
    crmGone: "Törölve a CRM-ben",
    openInCrm: "Megnyitás a CRM-ben",
    doneInCrm: "Kész a CRM-ben",
    linkedHint: "CRM feladathoz kapcsolva (itt nem módosítható).",
  },
  taskUpdate: {
    title: "Kész feladatok jelentése",
    subtitle: "Formázott feladatfrissítés küldése közvetlenül ebbe a WhatsApp csevegésbe.",
    selectTasks: "Válassza ki a kész feladatokat",
    noCompletedTasks: "Nincsenek jelenthető kész feladatok.",
    notesLabel: "Megjegyzés a feladathoz (opcionális)",
    notesPlaceholder: "Adjon hozzá megjegyzést…",
    attachFiles: "Fotók vagy dokumentumok csatolása",
    removeFile: "Fájl eltávolítása",
    preview: "WhatsApp üzenet előnézete",
    language: "Üzenet nyelve",
    sendUpdate: "Frissítés küldése",
    sending: "Küldés…",
    success: "A feladatfrissítés sikeresen elküldve.",
    cancel: "Mégse",
    tooManyFiles: "Legfeljebb 10 melléklet.",
    fileTooLarge: "A fájl meghaladja a 32 MB-os korlátot.",
    offline: "A WhatsApp offline. Csatlakoztassa újra a fiókot.",
    failed: "A frissítést nem sikerült elküldeni.",
    partial: (n) => `A szöveg elment, de ${n} melléklet sikertelen volt.`,
  },
  crmLink: {
    title: "CRM-kapcsolatok",
    chip: "CRM",
    none: "Kapcsolás a CRM-hez",
    hint: "A kapcsolt rekordok megjelenítik ezt a csevegést a CRM-ben és felveszik a feladatait.",
    ambiguousClient: (n) => `${n} ügyfél használja ezt a számot — válasszon egyet`,
    ambiguousLead: (n) => `${n} érdeklődő használja ezt a számot — válasszon egyet`,
    linkedSection: "Kapcsolt rekordok",
    candidatesSection: "Melyik?",
    search: "Ügyfél, érdeklődő vagy projekt keresése…",
    noResults: "Nincs találat.",
    client: "Ügyfél",
    lead: "Érdeklődő",
    project: "Projekt",
    auto: "automatikus",
    manual: "kézi",
    unlink: "Kapcsolat törlése",
    link: "Kapcsolás",
    openInCrm: "Megnyitás a CRM-ben",
    failed: "A kapcsolat mentése nem sikerült.",
  },
};

export function getPanelI18n(lang: string): PanelTranslations {
  const code = lang.slice(0, 2).toLowerCase();
  return code === "sk" ? sk : code === "hu" ? hu : en;
}
