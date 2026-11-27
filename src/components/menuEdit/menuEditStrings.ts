import type { Language } from "../../utils/translations";

/**
 * Every visible string of the menu edit mode (Start menu dialog, the sidebar in
 * edit mode, the mobile editor and their menus/sheets), in en/sk/hu.
 *
 * One table so the three surfaces say the same thing in the same words.
 */
type Lang = "en" | "sk" | "hu";

const pick = (lang: Lang, en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);

/** Slovak noun form after a number: 1 modul, 2–4 moduly, 5+ modulov. */
const skModules = (n: number) => (n === 1 ? "modul" : n >= 2 && n <= 4 ? "moduly" : "modulov");
const skMove = (n: number) => (n >= 2 && n <= 4 ? "presunú" : "presunie");

export function menuEditStrings(language: Language | string) {
  const lang: Lang = language === "sk" || language === "hu" ? language : "en";
  const p = (en: string, sk: string, hu: string) => pick(lang, en, sk, hu);

  return {
    // Sidebar (desktop) in edit mode
    editingMenu: p("Editing the menu", "Upravujete menu", "A menü szerkesztése"),
    sidebarHint: p(
      "Pinned modules live here. Drag to reorder; more actions are under ⋯.",
      "Tu sú pripnuté moduly. Poradie zmeníte potiahnutím, ďalšie akcie sú pod ⋯.",
      "Itt vannak a kitűzött modulok. Húzással rendezheti őket, további műveletek a ⋯ alatt."
    ),
    newSidebarGroup: p("New sidebar group", "Nová skupina v paneli", "Új csoport az oldalsávban"),
    dropToPin: p("Drop to pin to the sidebar", "Pustite pre pripnutie do panela", "Engedje el a kitűzéshez"),
    dropHere: (name: string) => p(`${name} here`, `${name} sem`, `${name} ide`),

    // Start menu edit dialog (desktop)
    title: p("Edit menu", "Upraviť menu", "Menü szerkesztése"),
    subtitle: p(
      "Arrange the modules in the Start menu and choose which ones are pinned to the sidebar.",
      "Usporiadajte moduly v Štart menu a vyberte, ktoré budú pripnuté v bočnom paneli.",
      "Rendezze a Start menü moduljait, és válassza ki, melyek legyenek kitűzve az oldalsávra."
    ),
    searchModule: p("Search modules", "Hľadať modul", "Modul keresése"),
    newGroup: p("New group", "Nová skupina", "Új csoport"),
    moreOptions: p(
      "More options: custom dashboard, restore defaults",
      "Ďalšie možnosti: vlastný panel, obnoviť predvolené",
      "További lehetőségek: egyéni irányítópult, alapértékek visszaállítása"
    ),
    done: p("Done", "Hotovo", "Kész"),
    startScreen: p("Start screen", "Úvodná obrazovka", "Kezdőképernyő"),
    startScreenValue: (name: string) =>
      p(`Start screen: ${name}`, `Úvodná obrazovka: ${name}`, `Kezdőképernyő: ${name}`),
    startScreenUpdated: p(
      "Default start screen updated.",
      "Predvolená úvodná obrazovka bola zmenená.",
      "Az alapértelmezett kezdőképernyő frissítve."
    ),
    legendDrag: p("Drag to move", "Potiahnite pre presun", "Húzza az áthelyezéshez"),
    legendPinned: p("Pinned to the sidebar", "Pripnuté v bočnom paneli", "Kitűzve az oldalsávra"),
    legendMore: p("More actions", "Ďalšie akcie", "További műveletek"),
    pinnedAria: p("Pinned to the sidebar", "Pripnuté v bočnom paneli", "Kitűzve az oldalsávra"),
    pinToSidebar: p("Pin to the sidebar", "Pripnúť do bočného panela", "Kitűzés az oldalsávra"),
    unpinFromSidebar: p("Unpin from the sidebar", "Odopnúť z bočného panela", "Levétel az oldalsávról"),
    itemActions: (name: string) => p(`Actions for ${name}`, `Akcie pre ${name}`, `${name} – műveletek`),
    groupOptions: (name: string) =>
      p(`Options for group ${name}`, `Možnosti skupiny ${name}`, `${name} csoport beállításai`),
    groupOptionsShort: p("Group options", "Možnosti skupiny", "Csoport beállításai"),
    addModuleToGroup: (name: string) =>
      p(`Add a module to ${name}`, `Pridať modul do skupiny ${name}`, `Modul hozzáadása ehhez: ${name}`),
    addModule: p("Add module", "Pridať modul", "Modul hozzáadása"),
    addModuleOrDashboard: p("Add module or dashboard", "Pridať modul alebo panel", "Modul vagy irányítópult hozzáadása"),
    homeBadge: p("Start", "Úvodná", "Kezdő"),
    customDashboard: p("Custom dashboard", "Vlastný panel", "Egyéni irányítópult"),
    customTable: p("Custom table", "Vlastná tabuľka", "Egyéni táblázat"),
    hiddenModules: p("Hidden modules", "Skryté moduly", "Rejtett modulok"),
    hiddenHint: p(
      "Not in the Start menu or the sidebar. Drag modules here, or back into a group.",
      "Nie sú v Štart menu ani v bočnom paneli. Presuňte ich sem alebo späť do skupiny.",
      "Nincsenek sem a Start menüben, sem az oldalsávon. Húzza ide őket, vagy vissza egy csoportba."
    ),
    hiddenDropHint: p("Drop here to hide", "Pustite sem pre skrytie", "Engedje el az elrejtéshez"),
    show: p("Show", "Zobraziť", "Megjelenítés"),
    originalSlot: (name: string) => p(`${name} — original spot`, `${name} — pôvodné miesto`, `${name} — eredeti hely`),
    emptyGroupDrop: p("Drag modules here", "Sem presuňte moduly", "Húzza ide a modulokat"),
    createCustomDashboard: p("Create a custom dashboard", "Vytvoriť vlastný panel", "Egyéni irányítópult létrehozása"),
    restoreDefaults: p("Restore defaults", "Obnoviť predvolené", "Alapértékek visszaállítása"),
    restoreDefaultsTitle: p(
      "Restore the default Start menu layout?",
      "Obnoviť predvolené rozloženie Štart menu?",
      "Visszaállítja a Start menü alapértelmezett elrendezését?"
    ),
    restoreDefaultsBody: p(
      "Your groups, their order and the hidden modules go back to the defaults.",
      "Vaše skupiny, ich poradie a skryté moduly sa vrátia na predvolené.",
      "A csoportok, sorrendjük és a rejtett modulok visszaállnak az alapértékekre."
    ),
    restore: p("Restore", "Obnoviť", "Visszaállítás"),
    groupFallback: (n: number) => p(`Group ${n}`, `Skupina ${n}`, `${n}. csoport`),
    newGroupName: (n: number) => p(`New group ${n}`, `Nová skupina ${n}`, `Új csoport ${n}`),

    // Item menu
    setAsStart: p("Set as start screen", "Nastaviť ako úvodnú obrazovku", "Beállítás kezdőképernyőként"),
    moveToGroup: p("Move to group", "Presunúť do skupiny", "Áthelyezés csoportba"),
    moveUp: p("Move up", "Posunúť vyššie", "Feljebb"),
    moveDown: p("Move down", "Posunúť nižšie", "Lejjebb"),
    moveLeft: p("Move left", "Posunúť doľava", "Balra"),
    moveRight: p("Move right", "Posunúť doprava", "Jobbra"),
    kbdUp: "Alt ↑",
    kbdDown: "Alt ↓",
    hideModule: p("Hide module", "Skryť modul", "Modul elrejtése"),
    hideModuleHint: p(
      "Leaves both the Start menu and the sidebar",
      "Zmizne zo Štart menu aj z panela",
      "Eltűnik a Start menüből és az oldalsávról is"
    ),

    // Group menu, rename, delete
    rename: p("Rename", "Premenovať", "Átnevezés"),
    deleteGroupEllipsis: p("Delete group…", "Vymazať skupinu…", "Csoport törlése…"),
    groupName: p("Group name", "Názov skupiny", "Csoport neve"),
    saveName: p("Save name", "Uložiť názov", "Név mentése"),
    cancel: p("Cancel", "Zrušiť", "Mégse"),
    renameHint: p("Enter saves · Esc cancels", "Enter uloží · Esc zruší", "Enter: mentés · Esc: mégse"),
    deleteGroupTitle: (name: string) =>
      p(`Delete the group ${name}?`, `Vymazať skupinu ${name}?`, `Törli a(z) ${name} csoportot?`),
    deleteGroupBody: (n: number) =>
      p(
        `Its ${n} ${n === 1 ? "module moves" : "modules move"} to Hidden modules. You can bring them back to another group at any time.`,
        `Jej ${n} ${skModules(n)} sa ${skMove(n)} medzi Skryté moduly. Odtiaľ ich môžete kedykoľvek vrátiť do inej skupiny.`,
        `${n} modulja a Rejtett modulok közé kerül. Onnan bármikor visszahelyezheti őket egy másik csoportba.`
      ),
    deleteGroupNote: p(
      "Pinned modules stay in the sidebar.",
      "Pripnuté moduly zostanú v bočnom paneli.",
      "A kitűzött modulok az oldalsávon maradnak."
    ),
    deleteSidebarGroupBody: (n: number, target: string) =>
      p(
        `Its ${n} ${n === 1 ? "module moves" : "modules move"} to the group ${target}.`,
        `Jej ${n} ${skModules(n)} sa ${skMove(n)} do skupiny ${target}.`,
        `${n} modulja a(z) ${target} csoportba kerül.`
      ),
    deleteSidebarGroupEmpty: p(
      "The group is empty, nothing else changes.",
      "Skupina je prázdna, nič iné sa nezmení.",
      "A csoport üres, más nem változik."
    ),
    deleteSidebarGroupNote: p(
      "The modules stay in the Start menu.",
      "Moduly zostanú v Štart menu.",
      "A modulok a Start menüben maradnak."
    ),
    deleteGroup: p("Delete group", "Vymazať skupinu", "Csoport törlése"),
    groupDeleted: p("Group deleted", "Skupina bola vymazaná", "A csoport törölve"),
    undo: p("Undo", "Späť", "Visszavonás"),

    // Drag
    pin: p("Pin", "Pripnúť", "Kitűzés"),
    moving: p("Moving", "Presúvate", "Áthelyezés"),

    // Mobile editor and sheets
    mobileHintBefore: p(
      "Modules in the sidebar and the bottom bar. Hold",
      "Moduly v bočnom paneli a spodnej lište. Podržte",
      "Az oldalsáv és az alsó sáv moduljai. Tartsa lenyomva a"
    ),
    mobileHintAfter: p(" and drag to reorder.", " a potiahnite pre zmenu poradia.", " jelet, és húzza az átrendezéshez."),
    groupPosition: (group: string, i: number, n: number) =>
      p(`Group ${group} · ${i} of ${n}`, `Skupina ${group} · ${i}. z ${n}`, `${group} csoport · ${i}/${n}`),
    isFirst: p("Already first", "Je prvý", "Már az első"),
    isLast: p("Already last", "Je posledný", "Már az utolsó"),
    unpinFromPanel: p("Unpin from the sidebar", "Odopnúť z panela", "Levétel az oldalsávról"),
    staysInStartMenu: p("The module stays in the Start menu", "Modul zostane v Štart menu", "A modul a Start menüben marad"),
    addToGroupTitle: (name: string) => p(`Add to ${name}`, `Pridať do skupiny ${name}`, `Hozzáadás: ${name}`),
    addToGroupHint: p(
      "Pick a module to show in the sidebar.",
      "Vyberte modul, ktorý sa zobrazí v bočnom paneli.",
      "Válassza ki az oldalsávon megjelenő modult."
    ),
    close: p("Close", "Zavrieť", "Bezárás"),
    unpinnedModules: p("Unpinned modules", "Nepripnuté moduly", "Ki nem tűzött modulok"),
    alsoInStartMenu: p(
      "Adding it also shows it in the Start menu",
      "Po pridaní sa zobrazí aj v Štart menu",
      "Hozzáadás után a Start menüben is megjelenik"
    ),
    noModulesFound: p("No module matches the search", "Žiadny modul nezodpovedá hľadaniu", "Nincs a keresésnek megfelelő modul"),
    allModulesAdded: p("All modules are already added", "Všetky moduly sú už pridané", "Minden modul hozzá van adva"),
  };
}

export type MenuEditStrings = ReturnType<typeof menuEditStrings>;
