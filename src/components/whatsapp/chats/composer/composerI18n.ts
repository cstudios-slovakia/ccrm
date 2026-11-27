/**
 * Strings for the WhatsApp composer, actions, voice recorder, reactions,
 * forward picker, text assist, and open by phone in en, sk, and hu.
 */

const en = {
  placeholder: "Type a message…",
  send: "Send",
  attachFile: "Attach file",
  removeAttachment: "Remove attachment",
  fileTooLarge: (max: string) => `File exceeds the maximum limit of ${max}.`,
  uploading: "Uploading…",
  uploadFailed: "Upload failed.",

  // Voice note
  recordVoice: "Record voice note",
  recording: "Recording…",
  cancelRecording: "Cancel recording",
  sendVoice: "Send voice note",
  micDenied: "Microphone access was denied. Please allow microphone access in your browser settings.",
  micUnavailable: "Microphone is unavailable or not supported.",

  // Reply / Edit banners
  replyingTo: "Replying to",
  cancelReply: "Cancel reply",
  editingMessage: "Editing message",
  cancelEdit: "Cancel editing",
  saveEdit: "Save changes",
  editFailed: "Could not save edit. WhatsApp allows editing only within 15 minutes.",

  // Emoji picker
  emoji: "Emoji",
  searchEmoji: "Search emojis…",
  noEmojiFound: "No emojis match your search",
  categories: {
    smileys: "Smileys & Emotion",
    people: "People & Body",
    animals: "Animals & Nature",
    food: "Food & Drink",
    travel: "Travel & Places",
    activities: "Activities",
    objects: "Objects",
    symbols: "Symbols",
    flags: "Flags",
  },

  // Reaction bar
  addReaction: "Add reaction",
  removeReaction: "Remove reaction",
  react: "React",

  // Message actions
  actions: "Message actions",
  reply: "Reply",
  reactAction: "React",
  copy: "Copy text",
  copied: "Copied!",
  edit: "Edit message",
  forward: "Forward",
  delete: "Delete message",
  deleteTitle: "Delete message",
  deletePrompt: "Are you sure you want to delete this message?",
  deleteForMe: "Delete for me",
  deleteForEveryone: "Delete for everyone",
  deleteFailed: "Could not delete message.",
  cancel: "Cancel",

  // Forward dialog
  forwardTitle: "Forward message",
  forwardSearch: "Search conversations…",
  forwardTo: "Forward to",
  forwarding: "Forwarding…",
  forwardSuccess: "Message forwarded",
  forwardFailed: "Could not forward message.",
  crossAccountDisabled: "Cannot forward to a different WhatsApp account",
  noConversations: "No conversations found",

  // AI text assist
  textAssist: "AI Text Assist",
  improve: "Improve writing",
  shorten: "Make shorter",
  elaborate: "Make longer",
  professional: "Professional tone",
  casual: "Casual tone",
  suggestReply: "Suggest reply",
  translate: "Translate",
  targetLang: "Target language",
  english: "English",
  slovak: "Slovak",
  hungarian: "Hungarian",
  generating: "Generating with AI…",
  applyText: "Replace draft",
  originalText: "Original text",
  assistedText: "Suggested text",
  assistFailed: "AI text assist could not generate a suggestion.",

  // Open by phone
  openByPhoneTitle: "Start chat by phone",
  checkingPhone: "Checking WhatsApp registration…",
  notRegisteredTitle: "Not on WhatsApp",
  notRegisteredBody: (phone: string) => `The phone number ${phone} is not registered on WhatsApp.`,
  openErrorTitle: "Could not check phone number",
  openErrorOffline: "The WhatsApp account is currently offline. Please reconnect.",
  openErrorLimit: "You have reached the limit for checking phone numbers. Try again later.",
  openErrorGeneric: "An error occurred while checking WhatsApp. Please try again.",
  startChatTitle: "Start conversation",
  firstMessagePlaceholder: "Type your first message…",
  startChatButton: "Start chat",
  startingChat: "Starting chat…",
  openSuccessNoChat: "Message sent! The conversation will appear in your chat list shortly.",
  retry: "Try again",
  back: "Back",
};

export type ComposerMessages = typeof en;

const sk: ComposerMessages = {
  placeholder: "Napíšte správu…",
  send: "Odoslať",
  attachFile: "Priložiť súbor",
  removeAttachment: "Odstrániť prílohu",
  fileTooLarge: (max: string) => `Súbor presahuje maximálnu povolenú veľkosť ${max}.`,
  uploading: "Nahrávam…",
  uploadFailed: "Nahrávanie zlyhalo.",

  // Voice note
  recordVoice: "Nahrať hlasovú správu",
  recording: "Nahráva sa…",
  cancelRecording: "Zrušiť nahrávanie",
  sendVoice: "Odoslať hlasovú správu",
  micDenied: "Prístup k mikrofónu bol odmietnutý. Povoľte prístup v nastaveniach prehliadača.",
  micUnavailable: "Mikrofón nie je dostupný alebo nie je podporovaný.",

  // Reply / Edit banners
  replyingTo: "Odpoveď pre",
  cancelReply: "Zrušiť odpoveď",
  editingMessage: "Úprava správy",
  cancelEdit: "Zrušiť úpravu",
  saveEdit: "Uložiť zmeny",
  editFailed: "Správu sa nepodarilo upraviť. WhatsApp povoľuje úpravu iba do 15 minút od odoslania.",

  // Emoji picker
  emoji: "Emoji",
  searchEmoji: "Hľadať emoji…",
  noEmojiFound: "Nenašli sa žiadne emoji",
  categories: {
    smileys: "Smajlíky a emócie",
    people: "Ľudia a telo",
    animals: "Zvieratá a príroda",
    food: "Jedlo a pitie",
    travel: "Cestovanie a miesta",
    activities: "Aktivity",
    objects: "Objekty",
    symbols: "Symboly",
    flags: "Vlajky",
  },

  // Reaction bar
  addReaction: "Pridať reakciu",
  removeReaction: "Odstrániť reakciu",
  react: "Reagovať",

  // Message actions
  actions: "Možnosti správy",
  reply: "Odpovedať",
  reactAction: "Reagovať",
  copy: "Kopírovať text",
  copied: "Skopírované!",
  edit: "Upraviť správu",
  forward: "Preposlať",
  delete: "Vymazať správu",
  deleteTitle: "Vymazať správu",
  deletePrompt: "Naozaj chcete vymazať túto správu?",
  deleteForMe: "Vymazať pre mňa",
  deleteForEveryone: "Vymazať pre všetkých",
  deleteFailed: "Správu sa nepodarilo vymazať.",
  cancel: "Zrušiť",

  // Forward dialog
  forwardTitle: "Preposlať správu",
  forwardSearch: "Hľadať v chatoch…",
  forwardTo: "Preposlať do",
  forwarding: "Preposielam…",
  forwardSuccess: "Správa bola preposlaná",
  forwardFailed: "Správu sa nepodarilo preposlať.",
  crossAccountDisabled: "Nie je možné preposielať medzi rôznymi účtami WhatsApp",
  noConversations: "Nenašli sa žiadne chaty",

  // AI text assist
  textAssist: "AI Asistent písania",
  improve: "Vylepšiť text",
  shorten: "Skrátiť",
  elaborate: "Rozpísať",
  professional: "Profesionálny tón",
  casual: "Neformálny tón",
  suggestReply: "Navrhnúť odpoveď",
  translate: "Preložiť",
  targetLang: "Cieľový jazyk",
  english: "Angličtina",
  slovak: "Slovenčina",
  hungarian: "Maďarčina",
  generating: "AI generuje text…",
  applyText: "Nahradiť text",
  originalText: "Pôvodný text",
  assistedText: "Navrhnutý text",
  assistFailed: "AI asistentovi sa nepodarilo vygenerovať návrh.",

  // Open by phone
  openByPhoneTitle: "Začať chat podľa čísla",
  checkingPhone: "Overujem registráciu na WhatsApp…",
  notRegisteredTitle: "Nie je na WhatsAppe",
  notRegisteredBody: (phone: string) => `Telefónne číslo ${phone} nie je zaregistrované v službe WhatsApp.`,
  openErrorTitle: "Číslo sa nepodarilo overiť",
  openErrorOffline: "Účet WhatsApp je momentálne odpojený. Pripojte ho znova.",
  openErrorLimit: "Bol dosiahnutý limit overovania čísel. Skúste to neskôr.",
  openErrorGeneric: "Pri overovaní čísla sa vyskytla chyba. Skúste to znova.",
  startChatTitle: "Začať konverzáciu",
  firstMessagePlaceholder: "Napíšte prvú správu…",
  startChatButton: "Začať chat",
  startingChat: "Začínam chat…",
  openSuccessNoChat: "Správa odoslaná! Konverzácia sa čoskoro zobrazí v zozname chatov.",
  retry: "Skúsiť znova",
  back: "Späť",
};

const hu: ComposerMessages = {
  placeholder: "Írjon üzenetet…",
  send: "Küldés",
  attachFile: "Fájl csatolása",
  removeAttachment: "Melléklet eltávolítása",
  fileTooLarge: (max: string) => `A fájl meghaladja a maximális méretet (${max}).`,
  uploading: "Feltöltés…",
  uploadFailed: "A feltöltés sikertelen.",

  // Voice note
  recordVoice: "Hangüzenet rögzítése",
  recording: "Felvétel…",
  cancelRecording: "Felvétel megszakítása",
  sendVoice: "Hangüzenet küldése",
  micDenied: "A mikrofon-hozzáférés megtagadva. Engedélyezze a böngésző beállításaiban.",
  micUnavailable: "A mikrofon nem érhető el vagy nem támogatott.",

  // Reply / Edit banners
  replyingTo: "Válasz neki",
  cancelReply: "Válasz megszakítása",
  editingMessage: "Üzenet szerkesztése",
  cancelEdit: "Szerkesztés megszakítása",
  saveEdit: "Módosítás mentése",
  editFailed: "Nem sikerült menteni. A WhatsApp csak a küldést követő 15 percben engedi a szerkesztést.",

  // Emoji picker
  emoji: "Hangulatjel",
  searchEmoji: "Hangulatjelek keresése…",
  noEmojiFound: "Nincs egyező hangulatjel",
  categories: {
    smileys: "Mosolyok és érzelmek",
    people: "Emberek és test",
    animals: "Állatok és természet",
    food: "Étel és ital",
    travel: "Utazás és helyek",
    activities: "Tevékenységek",
    objects: "Tárgyak",
    symbols: "Szimbólumok",
    flags: "Zászlók",
  },

  // Reaction bar
  addReaction: "Reakció hozzáadása",
  removeReaction: "Reakció eltávolítása",
  react: "Reakció",

  // Message actions
  actions: "Üzenet műveletei",
  reply: "Válasz",
  reactAction: "Reakció",
  copy: "Szöveg másolása",
  copied: "Másolva!",
  edit: "Üzenet szerkesztése",
  forward: "Továbbítás",
  delete: "Üzenet törlése",
  deleteTitle: "Üzenet törlése",
  deletePrompt: "Biztosan törölni szeretné ezt az üzenetet?",
  deleteForMe: "Törlés nekem",
  deleteForEveryone: "Törlés mindenkinek",
  deleteFailed: "Az üzenetet nem sikerült törölni.",
  cancel: "Mégse",

  // Forward dialog
  forwardTitle: "Üzenet továbbítása",
  forwardSearch: "Csevegések keresése…",
  forwardTo: "Továbbítás ide",
  forwarding: "Továbbítás…",
  forwardSuccess: "Üzenet továbbítva",
  forwardFailed: "Nem sikerült továbbítani az üzenetet.",
  crossAccountDisabled: "Nem lehet másik WhatsApp fiókba továbbítani",
  noConversations: "Nem található csevegés",

  // AI text assist
  textAssist: "AI Szövegsegéd",
  improve: "Szöveg javítása",
  shorten: "Rövidítés",
  elaborate: "Bővítés",
  professional: "Professzionális hangnem",
  casual: "Közvetlen hangnem",
  suggestReply: "Válasz javaslata",
  translate: "Fordítás",
  targetLang: "Célnyelv",
  english: "Angol",
  slovak: "Szlovák",
  hungarian: "Magyar",
  generating: "AI generálás…",
  applyText: "Piszkozat cseréje",
  originalText: "Eredeti szöveg",
  assistedText: "Javasolt szöveg",
  assistFailed: "Az AI szövegsegéd nem tudott javaslatot generálni.",

  // Open by phone
  openByPhoneTitle: "Csevegés indítása telefonszámmal",
  checkingPhone: "WhatsApp regisztráció ellenőrzése…",
  notRegisteredTitle: "Nincs a WhatsAppon",
  notRegisteredBody: (phone: string) => `A(z) ${phone} telefonszám nincs regisztrálva a WhatsAppon.`,
  openErrorTitle: "A telefonszám ellenőrzése nem sikerült",
  openErrorOffline: "A WhatsApp-fiók jelenleg offline. Csatlakoztassa újra.",
  openErrorLimit: "Elérte a számellenőrzési korlátot. Próbálja újra később.",
  openErrorGeneric: "Hiba történt a WhatsApp ellenőrzésekor. Próbálja újra.",
  startChatTitle: "Csevegés indítása",
  firstMessagePlaceholder: "Írja be az első üzenetet…",
  startChatButton: "Csevegés indítása",
  startingChat: "Csevegés indítása…",
  openSuccessNoChat: "Üzenet elküldve! A csevegés hamarosan megjelenik a listában.",
  retry: "Újra",
  back: "Vissza",
};

export function composerMessages(lang?: string): ComposerMessages {
  const code = (lang || "").slice(0, 2).toLowerCase();
  return code === "sk" ? sk : code === "hu" ? hu : en;
}
