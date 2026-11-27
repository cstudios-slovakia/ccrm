import { PRODUCT_NAME } from "../../../src/utils/brand.ts";

/** The popup speaks the browser's language: Slovak, Hungarian, else English. */
const language = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase();
const index = language.startsWith("sk") ? 1 : language.startsWith("hu") ? 2 : 0;

export const t = (en: string, sk: string, hu: string): string => [en, sk, hu][index];
export { PRODUCT_NAME };

/** One human sentence per code the extension endpoints return; unknown codes get a generic line plus the code. */
export function errorMessage(code: string): string {
  const messages: Record<string, [string, string, string]> = {
    offline: [`Could not reach ${PRODUCT_NAME}.`, `${PRODUCT_NAME} nie je dostupný.`, `A ${PRODUCT_NAME} nem érhető el.`],
    already_running: ["That work is already running.", "Táto práca už beží.", "Ez a munka már fut."],
    ambiguous: ["Several timers are running. Pick the one to stop.", "Beží viac časovačov. Vyberte ten, ktorý chcete zastaviť.", "Több időzítő fut. Válassza ki, melyiket állítja le."],
    bad_request: ["The request was not understood. Update the extension and try again.", "Požiadavke sa nerozumelo. Aktualizujte rozšírenie a skúste znova.", "A kérés nem értelmezhető. Frissítse a bővítményt, majd próbálja újra."],
    bad_timestamp: ["The time sent was not valid. Check this computer's clock.", "Odoslaný čas nie je platný. Skontrolujte hodiny tohto počítača.", "A küldött időpont érvénytelen. Ellenőrizze a számítógép óráját."],
    timestamp_out_of_window: ["This computer's clock differs too much from the server. Check the clock.", "Hodiny tohto počítača sa príliš líšia od servera. Skontrolujte ich.", "A számítógép órája túlságosan eltér a szervertől. Ellenőrizze az órát."],
    end_before_start: ["The stop time is before the start time.", "Čas zastavenia je pred časom spustenia.", "A leállítás ideje a kezdés előtt van."],
    capture_disabled: ["Remembering watched sites is turned off for this company.", "Pamätanie sledovaných stránok je pre túto firmu vypnuté.", "A figyelt oldalak megjegyzése ennél a cégnél ki van kapcsolva."],
    code_expired: ["That code has expired. Ask for a new one.", "Platnosť kódu vypršala. Požiadajte o nový.", "A kód lejárt. Kérjen újat."],
    code_invalid: ["That code was not accepted.", "Kód nebol prijatý.", "A kód nem lett elfogadva."],
    code_used: ["That code was already used.", "Tento kód už bol použitý.", "Ezt a kódot már felhasználták."],
    database_unavailable: [`${PRODUCT_NAME} cannot reach its database right now. Try again shortly.`, `${PRODUCT_NAME} sa momentálne nevie spojiť s databázou. Skúste to o chvíľu.`, `A ${PRODUCT_NAME} jelenleg nem éri el az adatbázist. Próbálja újra hamarosan.`],
    extension_disabled: ["The extension is turned off for this company.", "Rozšírenie je pre túto firmu vypnuté.", "A bővítmény ennél a cégnél ki van kapcsolva."],
    forbidden: ["You do not have permission for this.", "Na toto nemáte oprávnenie.", "Ehhez nincs jogosultsága."],
    method_not_allowed: ["The request was not allowed. Update the extension and try again.", "Požiadavka nebola povolená. Aktualizujte rozšírenie a skúste znova.", "A kérés nem engedélyezett. Frissítse a bővítményt, majd próbálja újra."],
    not_found: ["That item no longer exists.", "Táto položka už neexistuje.", "Ez az elem már nem létezik."],
    not_installed: [`${PRODUCT_NAME} is not set up on this server yet.`, `${PRODUCT_NAME} nie je na tomto serveri ešte nastavený.`, `A ${PRODUCT_NAME} ezen a szerveren még nincs beállítva.`],
    not_paired: ["This browser is not paired. Pair it again.", "Tento prehliadač nie je spárovaný. Spárujte ho znova.", "Ez a böngésző nincs párosítva. Párosítsa újra."],
    not_paused: ["That timer is not paused.", "Tento časovač nie je pozastavený.", "Ez az időzítő nincs szüneteltetve."],
    not_running: ["That timer is no longer running.", "Tento časovač už nebeží.", "Ez az időzítő már nem fut."],
    pause_expired: ["This pause has expired. Start the work again.", "Táto pauza vypršala. Spustite prácu znova.", "A szünet lejárt. Indítsa újra a munkát."],
    paused: ["The timers are paused. Resume them first.", "Časovače sú pozastavené. Najprv ich obnovte.", "Az időzítők szüneteltetve vannak. Előbb folytassa őket."],
    parallel_disabled: ["Parallel timers are disabled for this company.", "Paralelné časovače sú pre túto firmu vypnuté.", "A párhuzamos időzítők ennél a cégnél ki vannak kapcsolva."],
    parallel_forbidden: ["You do not have permission for parallel timers.", "Nemáte oprávnenie na paralelné časovače.", "Nincs jogosultsága párhuzamos időzítőkhöz."],
    parallel_limit: ["Maximum parallel timers reached. Stop or pause one first.", "Dosiahli ste maximum paralelných časovačov. Najprv jeden zastavte alebo pozastavte.", "Elérte a párhuzamos időzítők limitjét. Előbb állítson le vagy szüneteltessen egyet."],
    same_project: ["This project is already running in parallel.", "Tento projekt už beží paralelne.", "Ez a projekt már fut párhuzamosan."],
    project_required: [`Pick a project in ${PRODUCT_NAME} before stopping, or add one and stop again.`, `Pred zastavením vyberte projekt v ${PRODUCT_NAME} alebo ho pridajte a zastavte znova.`, `Leállítás előtt válasszon projektet a ${PRODUCT_NAME} rendszerben, vagy adjon hozzá egyet, és állítsa le újra.`],
    task_required: ["This project needs a task. Pick one.", "Tento projekt vyžaduje úlohu. Vyberte ju.", "Ehhez a projekthez feladat szükséges. Válasszon egyet."],
    task_not_found: ["That task no longer exists.", "Táto úloha už neexistuje.", "Ez a feladat már nem létezik."],
    task_is_recurring_template: ["A recurring task template cannot be tracked. Pick one of its tasks.", "Šablónu opakovanej úlohy nemožno sledovať. Vyberte jednu z jej úloh.", "Ismétlődő feladat sablonjára nem lehet időt mérni. Válasszon egyet a feladatai közül."],
    task_project_mismatch: ["That task belongs to a different project.", "Táto úloha patrí do iného projektu.", "Ez a feladat egy másik projekthez tartozik."],
    ticket_not_found: ["That ticket no longer exists.", "Tento tiket už neexistuje.", "Ez a jegy már nem létezik."],
    forbidden_ticket: ["You do not have access to that ticket.", "K tomuto tiketu nemáte prístup.", "Ehhez a jegyhez nincs hozzáférése."],
    forbidden_project: ["You do not have access to that project.", "K tomuto projektu nemáte prístup.", "Ehhez a projekthez nincs hozzáférése."],
    project_not_found: ["That project no longer exists.", "Tento projekt už neexistuje.", "Ez a projekt már nem létezik."],
    rate_limited: ["Too many attempts. Wait and try again.", "Príliš veľa pokusov. Počkajte a skúste znova.", "Túl sok kísérlet. Várjon, majd próbálja újra."],
    save_failed: ["Could not save. Try again.", "Nepodarilo sa uložiť. Skúste znova.", "A mentés nem sikerült. Próbálja újra."],
  };
  const known = messages[code];
  if (known) return t(known[0], known[1], known[2]);
  return `${t("Something went wrong.", "Niečo sa pokazilo.", "Valami hiba történt.")} (${code})`;
}
