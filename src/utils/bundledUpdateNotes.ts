import type { UpdateEntry } from "../components/UpdateNotesModal";

// The CMS remains the primary source for release notes. These entries record
// consolidated releases that were completed after the only CMS-published note.
// When the same version is later published in the CMS, the CMS entry wins.
export const bundledUpdateNotes: UpdateEntry[] = [
  {
    id: "bundled-1-8-43",
    version: "1.8.43",
    title: "AI dashboardy a spoľahlivejší asistent",
    siteHandle: "default",
    postDate: "2026-08-28",
    contentMatrix: [
      {
        __typename: "textblock_Entry",
        text: {
          html: `<p><strong>CCRM 1.8.43</strong> uzatvára ďalšiu sériu vylepšení verzie Imbe. Hlavnou témou sú vlastné AI dashboard panely a spoľahlivejší AI asistent; zoznam nižšie zahŕňa iba zmeny, ktoré používateľ vidí alebo ktorých opravu priamo pocíti pri práci.</p>
<h2>1. Vlastné AI dashboard panely</h2>
<p>Panely, ktoré si AI asistent sám navrhne na nástenke, dostali plnú funkčnosť aj jednotný vzhľad.</p>
<ul>
  <li><strong>Skutočné widgety namiesto zástupných:</strong> Panel teraz vykresľuje všetky typy, ktoré AI vie navrhnúť – ukazovateľ (gauge), KPI číslo, graf aj zoznam – namiesto toho, aby niektoré typy zostali nefunkčné.</li>
  <li><strong>Dostupné vo všetkých jazykoch aplikácie:</strong> Vlastné AI panely fungujú aj v anglickom a maďarskom rozhraní, nielen v slovenskom.</li>
  <li><strong>Staré panely sa preložia automaticky:</strong> Panely vytvorené pred touto zmenou sa pri otvorení preložia samé, bez nutnosti ručne stláčať tlačidlo.</li>
  <li><strong>Jednotný vzhľad a vrátený graf:</strong> Hlavička a šírka vlastných panelov zodpovedá ostatným dashboardom, medzery okolo prepínača AI modelu sú opravené a grafové widgety (Chart.js) opäť fungujú.</li>
  <li><strong>Chyba sa ukáže hneď:</strong> Ak sa dáta pre panel nepodarí načítať, panel to oznámi namiesto toho, aby zostal navždy vo faze načítavania ("...").</li>
</ul>
<h2>2. Spoľahlivejší AI asistent</h2>
<ul>
  <li><strong>Zrozumiteľný dôvod zlyhania:</strong> Ak AI funkcia zlyhá – chýbajúci alebo neplatný kľúč, vyčerpaný limit, chýbajúce dáta – aplikácia povie prečo namiesto jednej všeobecnej hlášky, a pri probléme s kľúčom ponúkne priamy odkaz do Nastavení.</li>
  <li><strong>Uložený kľúč už nevyzerá poškodený:</strong> Uložené API kľúče a heslá sa zobrazujú ako jasný stav "Uložené a zašifrované" namiesto radu bodiek či hviezdičiek, ktoré pôsobili ako chyba.</li>
  <li><strong>Opravené modely gpt-5 a o-sériu:</strong> AI požiadavky na tieto modely už neposielajú nepodporovaný parameter teploty, ktorý spôsoboval zlyhanie odpovede.</li>
</ul>
<h2>3. Múdrejšia databáza poznatkov (RAG)</h2>
<ul>
  <li><strong>Termíny a expirácie:</strong> Asistent vie odpovedať na otázky o blížiacich sa aj presiahnutých termínoch, splatnostiach a exspiráciách naprieč úlohami a evidenciami.</li>
  <li><strong>Finančný prehľad:</strong> Asistent vie na požiadanie zhrnúť príjmy, výdavky, cashflow a nezaplatené faktúry z modulu Financie.</li>
  <li><strong>Presnejšie vyhľadávanie v zázname:</strong> Odpovede lepšie rozpoznávajú, na ktorý konkrétny záznam alebo evidenciu sa otázka vzťahuje.</li>
</ul>
<h2>4. Vyhľadávanie a opravy rozhrania</h2>
<ul>
  <li><strong>Úplnejšie vyhľadávanie klientov a leadov:</strong> Pri výbere klienta alebo leadu (napríklad v priečinku alebo zázname) sa už ponúkajú všetky zodpovedajúce záznamy bez ohľadu na ich stav.</li>
  <li><strong>Rozbaľovacie menu a formuláre v bočných paneloch:</strong> Výberové polia sa už neschovávajú pod iné prvky a formuláre na vytvorenie úlohy či leadu zostávajú použiteľné aj v bočnom paneli.</li>
  <li><strong>Opravené neviditeľné orámovania a text:</strong> Niekoľko jemných orámovaní a textových prvkov naprieč aplikáciou používalo neplatný odtieň farby, takže sa vôbec nezobrazovali; teraz sú viditeľné tak, ako boli navrhnuté.</li>
</ul>`,
        },
      },
    ],
  },
  {
    id: "bundled-1-7-90",
    version: "1.7.90",
    title: "Najnovšie vylepšenia",
    siteHandle: "default",
    postDate: "2026-08-18",
    contentMatrix: [
      {
        __typename: "textblock_Entry",
        text: {
          html: `<p><strong>CCRM 1.7.90</strong> uzatvára prvú sériu vylepšení verzie Huckleberry. Zoznam nižšie zahŕňa iba zmeny, ktoré používateľ vidí alebo ktorých opravu priamo pocíti pri práci.</p>
<h2>1. Globálne úlohy a kalendár</h2>
<p>Práca s tímovými úlohami dostala nové pohľady aj spoľahlivejšie prepojenie s leadmi.</p>
<ul>
  <li><strong>Tímová nástenka s časovými skupinami:</strong> Globálne úlohy sú rozdelené do logických časových stĺpcov v chronologickom poradí, takže dnešné, blížiace sa a neskoršie úlohy sa dajú rýchlejšie skontrolovať.</li>
  <li><strong>Kalendár v Globálnych úlohách aj Archíve:</strong> Úlohy možno namiesto nástenky zobraziť v mesačnom kalendári. Rovnaký pohľad je dostupný aj pre archivované úlohy.</li>
  <li><strong>Úlohy z detailu leadu na správnom mieste:</strong> Úloha vytvorená v zásuvke leadu sa zobrazí v kalendári používateľa, ktorý ju vytvoril. Vymazanie bránovej úlohy sa zachová a archivovaná bránová úloha sa už nepovažuje za aktívnu.</li>
  <li><strong>Presnejšie dokončenie úloh:</strong> Systém zachová informáciu o tom, kto úlohu dokončil, aj po ďalšej synchronizácii a vie doplniť najpravdepodobnejšieho riešiteľa pri starších archivovaných úlohách.</li>
</ul>
<h2>2. Leady a klienti</h2>
<ul>
  <li><strong>Filter pipeline podľa hodnotenia klienta:</strong> Obchodnú nástenku možno zúžiť podľa ratingu klienta; šípky filtrov sú zarovnané tak, aby zostali dobre čitateľné aj pri dlhších názvoch.</li>
  <li><strong>Stav leadu priamo v detaile:</strong> Stav je možné zmeniť bez návratu na nástenku. Celý pás pipeline používa jednotný vzhľad, automaticky prispôsobuje veľkosť textu a zvýrazňuje fázu pri prejdení kurzorom.</li>
  <li><strong>Úplnejší formulár a profil:</strong> Zostávajúce polia formulára Pridať lead dostali rozpoznateľné ikony, odporúčanie leadu sa nestráca po synchronizácii a profil klienta zobrazuje dátum vytvorenia.</li>
  <li><strong>Kontrola IČ DPH už neblokuje uloženie:</strong> Overovanie DPH sa nezacyklí a indikátor ukladania po kontrole nezostane visieť.</li>
</ul>
<h2>3. Chronologická história a hlasové poznámky</h2>
<ul>
  <li><strong>Jednotná výška záznamov:</strong> Dlhé poznámky, e-maily a ostatné udalosti sa zobrazia v rovnako vysokých kartách. Tlačidlo Zobraziť viac / menej odkryje celý obsah bez posúvania karty.</li>
  <li><strong>Jasnejší pôvod udalosti:</strong> História zobrazuje osobu, ktorá záznam vytvorila alebo zmenila. E-mailové udalosti rozlišujú prijatú a odoslanú poštu a zmeny stavu majú vlastný typ udalosti.</li>
  <li><strong>Funkčné hlasové poznámky:</strong> Nahrávanie zvuku opäť funguje, nová nahrávka sa dá okamžite prehrať a hlasová poznámka zostane v histórii aj po najbližšej synchronizácii.</li>
</ul>
<h2>4. Workflowy – nové možnosti a opravy</h2>
<ul>
  <li><strong>Vizuálny tvorca podmienok Ak/Inak:</strong> Podmienky sa skladajú z poľa, operátora a hodnoty bez ručného písania výrazu. Editor zároveň ponúka päť ukážkových workflowov.</li>
  <li><strong>Lepšie ovládanie plátna:</strong> Uzly, spojenia a mriežka sa pri posúvaní pohybujú spolu, pribudlo približovanie a rozbaľovacie ponuky už nechtiac neposúvajú celé plátno.</li>
  <li><strong>Údaje zo spúšťača:</strong> Ďalšie bloky môžu použiť používateľa, ktorý udalosť vyvolal, vlastníka leadu, riešiteľa úlohy alebo autora záznamu. Pri vytvorení úlohy sa riešiteľ vyberá zo skutočných používateľov.</li>
  <li><strong>Filter nového klienta:</strong> Spúšťač Vytvorený klient môže reagovať iba na vybraný typ klienta – firmu alebo partnera.</li>
  <li><strong>Zrozumiteľný výsledok behu:</strong> História upozorní na bloky, ku ktorým nevedie žiadne spojenie. Workflow už neohlási úspešné odoslanie e-mailu, ak sa správa neodoslala, a vytvorená úloha sa uloží na správny deň v kalendári.</li>
</ul>
<h2>5. Súbory a import</h2>
<ul>
  <li><strong>Viac podporovaných dokumentov:</strong> Vyhľadávanie a spracovanie obsahu dokáže načítať text aj zo súborov XLSX a starších dokumentov vo formáte OLE.</li>
  <li><strong>Čitateľná chyba PDF:</strong> Ak prehliadač nevie PDF zobraziť, používateľ dostane vysvetlenie namiesto prázdnej čiernej plochy.</li>
  <li><strong>Kontrola vlastníkov pri importe:</strong> Import leadov vyžaduje, aby každý uvedený vlastník zodpovedal skutočnému používateľovi CRM; chybný údaj je označený ešte pred použitím importu.</li>
</ul>
<h2>6. Jednotnejšie a odolnejšie rozhranie</h2>
<ul>
  <li><strong>Vlastné výberové polia:</strong> Natívne systémové selecty boli nahradené jednotným CCRM ovládacím prvkom s vyhľadávaním, ikonami a konzistentným správaním.</li>
  <li><strong>Dátumy podľa jazyka:</strong> Formát dátumu sa riadi aktuálne zvoleným jazykom rozhrania.</li>
  <li><strong>Nastavenia naprieč zariadeniami:</strong> Používateľské preferencie sa ukladajú do databázy a fungujú aj v prehliadači, ktorý blokuje lokálne úložisko.</li>
  <li><strong>Jasné upozornenia pri prihlásení:</strong> Pri blokovaných cookies sa zobrazí konkrétne vysvetlenie. Ak otvorená karta patrí inému prihlásenému používateľovi, systém ju bezpečne odhlási namiesto zobrazenia nesprávnych dát.</li>
  <li><strong>Aktualizácie bez tvrdého obnovenia:</strong> Po nasadení novej verzie už zákazník nemusí ručne vymazávať cache ani používať hard refresh.</li>
</ul>`,
        },
      },
      {
        __typename: "imageWithText_Entry",
        text: {
          html: `<h2>Kalendár a tímové plánovanie</h2><p>Nový kalendárový pohľad zobrazuje termíny vedľa úloh a rovnakým prepínačom sprístupňuje vlastný kalendár, tímové úlohy aj archív. Zvýraznené časti ukazujú nové navigačné voľby a mesačný kalendár.</p>`,
        },
        image: [{
          url: "/update-screenshots/v1-7-90-tasks-calendar-highlighted.png",
          title: "Kalendár úloh, tímové úlohy a archív",
        }],
        imageDirection: true,
      },
      {
        __typename: "imageWithText_Entry",
        text: {
          html: `<h2>Pipeline a nové filtre</h2><p>Prehľad fáz zostáva stále viditeľný a rozšírený panel filtrov obsahuje aj nový filter podľa hodnotenia klienta.</p>`,
        },
        image: [{
          url: "/update-screenshots/v1-7-90-pipeline-filters-highlighted.png",
          title: "Prehľad pipeline a filter podľa hodnotenia klienta",
        }],
        imageDirection: false,
      },
      {
        __typename: "imageWithText_Entry",
        text: {
          html: `<h2>Čitateľnejšia história leadu</h2><p>Karty udalostí majú jednotnú výšku, zobrazujú autora a dlhý obsah sa rozbalí ovládaním Zobraziť viac. Zmena stavu má vlastnú, ľahko rozpoznateľnú kartu.</p>`,
        },
        image: [{
          url: "/update-screenshots/v1-7-90-timeline-highlighted.png",
          title: "Chronologická história s autormi a rozbaľovaním",
        }],
        imageDirection: true,
      },
      {
        __typename: "imageWithText_Entry",
        text: {
          html: `<h2>Vizuálne podmienky workflowu</h2><p>Spúšťače a pravidlá Ak/Inak sa nastavujú priamo na plátne. Zvýraznené bloky ukazujú filter udalosti a dvojpravidlovú podmienku bez potreby písať kód.</p>`,
        },
        image: [{
          url: "/update-screenshots/v1-7-workflow-editor-highlighted.png",
          title: "Workflow so spúšťačom a vizuálnou podmienkou Ak/Inak",
        }],
        imageDirection: false,
      },
    ],
  },
  {
    id: "bundled-1-7",
    version: "1.7",
    title: "Automatizácie, workflowy a sociálne siete",
    siteHandle: "default",
    postDate: "2026-08-10",
    contentMatrix: [
      {
        __typename: "textblock_Entry",
        text: {
          html: `<p>Hlavnou novinkou verzie <strong>CCRM 1.7 Huckleberry</strong> je modul <strong>Automatizácie a workflowy</strong>. Umožňuje skladať opakovateľné procesy podobným spôsobom ako v n8n alebo Make – priamo nad leadmi, klientmi a úlohami v CCRM.</p>
<h2>1. Vizuálny editor workflowov</h2>
<p>Každý workflow sa skladá zo spúšťača a nadväzujúcich blokov pre rozhodovanie, spracovanie údajov alebo vykonanie akcie.</p>
<ul>
  <li><strong>Horizontálne plátno s prepojeniami:</strong> Bloky sa spájajú z označeného výstupu do vstupu. Podmienka Ak/Inak má samostatné vetvy Pravda a Nepravda, takže priebeh workflowu je viditeľný priamo z diagramu.</li>
  <li><strong>Zbaliteľné bloky:</strong> Konfiguráciu každého uzla možno skryť a ponechať iba názov a spojenia. Veľké workflowy tak zostanú prehľadné.</li>
  <li><strong>Posúvanie, približovanie a obnovenie pohľadu:</strong> Plátno sa dá voľne posúvať a priblížiť; tlačidlo Obnoviť pohľad vráti diagram na východiskovú pozíciu.</li>
  <li><strong>Duplikovanie a správa workflowov:</strong> Hotový postup možno klonovať, zapnúť alebo vypnúť bez potreby vytvárať ho od začiatku.</li>
</ul>
<h2>2. Spúšťače udalostí</h2>
<ul>
  <li><strong>Leady:</strong> vytvorenie nového leadu s filtrom zdroja, zmena stavu s filtrom pôvodného a nového stavu alebo nový záznam v chronologickej histórii.</li>
  <li><strong>Klienti:</strong> vytvorenie nového klienta.</li>
  <li><strong>Úlohy:</strong> vytvorenie úlohy s filtrom riešiteľa alebo zmena stavu úlohy.</li>
  <li><strong>Časovač:</strong> pravidelné spúšťanie podľa nastaveného intervalu cez Cron.</li>
  <li><strong>Manuálne tlačidlo:</strong> vlastný rýchly príkaz v hornej lište. Používateľ si vyberie názov, farbu, ikonu a plný, obrysový alebo ikonový štýl tlačidla.</li>
</ul>
<h2>3. Bloky na spracovanie údajov</h2>
<ul>
  <li><strong>Ak/Inak:</strong> workflow sa môže rozdeliť podľa údajov z predchádzajúceho kroku alebo spúšťača.</li>
  <li><strong>AI procesor:</strong> blok môže odoslať pripravený prompt do OpenAI, Anthropic alebo Gemini a výsledok posunúť ďalšiemu kroku.</li>
  <li><strong>Premenné z predchádzajúcich blokov:</strong> Výberový panel vloží do textového poľa údaje ako meno, e-mail, stav alebo výsledok AI bez ručného prepisovania značiek.</li>
</ul>
<h2>4. Akcie workflowu</h2>
<ul>
  <li><strong>Vytvorenie leadu:</strong> Workflow vyplní názov, mesto, stav, hodnotu a zodpovednú osobu z pevných hodnôt alebo údajov spúšťača.</li>
  <li><strong>Vytvorenie klienta:</strong> Podporované sú kontaktné aj firemné údaje vrátane adresy, webu, IČO, DIČ a IČ DPH.</li>
  <li><strong>Vytvorenie úlohy:</strong> Nastaviť možno názov, popis, prioritu, riešiteľa a termín ako počet dní od spustenia.</li>
  <li><strong>Odoslanie e-mailu:</strong> Príjemca, predmet aj obsah môžu používať údaje z predošlých blokov.</li>
</ul>
<h2>5. História behov a nastavenia</h2>
<ul>
  <li><strong>Kontrola vykonaných krokov:</strong> Pri každom behu je viditeľný stav, čas a postup cez jednotlivé uzly vrátane vstupných a výstupných údajov.</li>
  <li><strong>Centrálne nastavenia AI:</strong> Kľúče pre OpenAI, Anthropic a Gemini sa spravujú v sekcii Nastavenia → AI a používajú sa vo všetkých AI blokoch.</li>
  <li><strong>Cron adresa:</strong> Nastavenia zobrazujú adresu potrebnú na pravidelné spracovanie časovaných workflowov.</li>
</ul>
<h2>6. Sociálne siete</h2>
<p>Druhou veľkou novinkou verzie 1.7 je sekcia <strong>Sociálne siete</strong>. Cez pripojenie na Zernio prináša príspevky zo všetkých firemných profilov do jedného prehľadu v CCRM – bez prepínania medzi Facebookom, Instagramom, LinkedInom či ďalšími sieťami.</p>
<ul>
  <li><strong>Pripojenie na jedno kliknutie:</strong> V Nastavenia → Sociálne siete stačí spustiť autorizáciu cez prehliadač alebo vložiť Zernio API kľúč. Stav pripojenia aj zoznam pripojených profilov sú viditeľné priamo v paneli; ak kľúč prestane platiť, systém to oznámi namiesto toho, aby ďalej hlásil funkčné pripojenie.</li>
  <li><strong>Zoznam príspevkov:</strong> Publikované, naplánované aj rozpracované príspevky sú zoradené podľa dátumu a zobrazené v dizajne pôvodnej siete. Bočný panel filtruje podľa siete, stavu a textu.</li>
  <li><strong>Kalendár publikovania:</strong> Mesačný prehľad ukazuje, čo a kedy vyšlo alebo vyjde. Kliknutie na deň otvorí bočný panel s celým obsahom daného dňa.</li>
  <li><strong>Analytika z reálnych čísel:</strong> Miera angažovanosti, zobrazenia, interakcie, rozloženie podľa sietí, vývoj v čase, rebríček najlepších príspevkov aj mapa najvhodnejšieho času na publikovanie sa počítajú výhradne z údajov, ktoré vrátili samotné siete. Filtre podľa siete a obdobia (7, 30 alebo 90 dní) prepočítajú všetky ukazovatele naraz a tlačidlo Exportovať stiahne CSV súbor s príspevkami za zvolené obdobie.</li>
  <li><strong>Detail príspevku a komentáre:</strong> Každý príspevok má vlastnú adresu, ktorú možno skopírovať a poslať kolegovi. V detaile sú výkonnostné čísla, odkaz na originál v sieti a živý zoznam komentárov načítaný priamo zo siete. Na komentár sa dá odpovedať priamo z CCRM – odpoveď sa zverejní na sociálnej sieti.</li>
  <li><strong>Zrozumiteľné stavy:</strong> Prázdny zoznam vysvetlí dôvod – Zernio ešte nie je pripojené, synchronizácia zlyhala, filtre nič nenašli, alebo účty zatiaľ nemajú príspevky.</li>
  <li><strong>Použiteľné na mobile:</strong> Kalendár aj analytické tabuľky sa posúvajú vo vlastnom rámci, bočný panel s komentármi sa skladá pod seba a zatváracie tlačidlá zostávajú dostupné aj na malých displejoch.</li>
</ul>`,
        },
      },
      {
        __typename: "imageWithText_Entry",
        text: {
          html: `<h2>Knižnica workflowov</h2><p>Hlavná stránka zobrazuje aktívne workflowy, počet behov a ich úspešnosť. Odtiaľ možno postup vytvoriť, otvoriť, duplikovať, deaktivovať alebo skontrolovať jeho záznamy.</p>`,
        },
        image: [{
          url: "/update-screenshots/v1-7-workflow-library-highlighted.png",
          title: "Knižnica workflowov so stavom behov",
        }],
        imageDirection: true,
      },
      {
        __typename: "imageWithText_Entry",
        text: {
          html: `<h2>Workflow na vizuálnom plátne</h2><p>Editor spája spúšťač, filtre, podmienky a akcie do jedného diagramu. Každý blok sa nastavuje priamo na plátne a pravý panel uchováva vlastnosti celého workflowu.</p>`,
        },
        image: [{
          url: "/update-screenshots/v1-7-workflow-editor-highlighted.png",
          title: "Vizuálny editor workflowov",
        }],
        imageDirection: false,
      },
    ],
  },
  {
    id: "bundled-1-6-33",
    version: "1.6.33",
    title: "Dokončovacie opravy verzie 1.6",
    siteHandle: "default",
    postDate: "2026-07-28",
    contentMatrix: [
      {
        __typename: "textblock_Entry",
        text: {
          html: `<p>Tento doplnkový changelog obsahuje iba používateľsky viditeľné zmeny vydané <strong>po pôvodnom predstavení CCRM 1.6 Grapefruit</strong>. Neopakuje AI nástenky ani projektové riadenie z prvého záznamu.</p>
<h2>1. Úlohy, termíny a archív</h2>
<ul>
  <li><strong>Vlastný čas termínu:</strong> Pri vytvorení aj úprave úlohy možno vybrať predvolený čas alebo zadať vlastný. Zvolená hodnota sa uloží a termín sa v kalendári zobrazí na správny deň.</li>
  <li><strong>Regionálny formát dátumu a času:</strong> Začiatok a termín úlohy rešpektujú miestne nastavenie používateľa namiesto jednotného pevného formátu.</li>
  <li><strong>Skutočný archív:</strong> Úlohu možno archivovať bez zmeny jej pracovného stavu, neskôr ju obnoviť alebo z archívu natrvalo vymazať.</li>
  <li><strong>Bezpečné mazanie a viditeľnosť:</strong> Akcie rešpektujú oprávnenia používateľa a termínový odznak už nepretečie mimo karty pri dlhšom texte.</li>
</ul>
<h2>2. Pipeline a detail leadu</h2>
<ul>
  <li><strong>Následný krok pre každú fázu:</strong> V Nastaveniach možno pri každom stave pipeline samostatne určiť, či má vyžadovať follow-up. Výber používa jednoznačné zaškrtávacie pole pre každú fázu.</li>
  <li><strong>Správne poradie fáz:</strong> Pipeline zobrazuje stavy v rovnakom poradí, aké je nastavené v konfigurácii systému.</li>
  <li><strong>Úprava budúcich udalostí:</strong> Naplánované záznamy v chronologickej histórii možno upraviť alebo odstrániť a rozdelenie na minulé a budúce udalosti používa miestny čas.</li>
  <li><strong>Správne kontaktné údaje:</strong> Detail leadu zobrazuje jeho vlastný e-mail a telefón namiesto údajov vlastníka. Obe hodnoty fungujú aj vo vyhľadávaní.</li>
  <li><strong>Čitateľnejší panel udalosti:</strong> Výber typu udalosti a jeho atribúty majú zrozumiteľnejšie názvy a usporiadanie.</li>
</ul>
<h2>3. E-mail</h2>
<ul>
  <li><strong>Ručná IMAP synchronizácia:</strong> Používateľ môže schránku synchronizovať tlačidlom a vidí čas poslednej úspešnej synchronizácie.</li>
  <li><strong>Funkčný SMTP test:</strong> Diagnostické tlačidlo skutočne odošle testovaciu správu a zobrazí reálny výsledok pripojenia.</li>
  <li><strong>Správy po vymazaní nezmiznú:</strong> Odstránenie jedného e-mailu už neskryje ostatné správy zo zoznamu.</li>
  <li><strong>Správne znaky v správach:</strong> Telo e-mailu sa dekóduje podľa jeho IMAP znakovej sady, takže diakritika a cudzie znaky sa zobrazia čitateľne.</li>
  <li><strong>Odolnejšie zobrazenie:</strong> Chybná extrakcia textu jednej správy už nezrúti celé e-mailové zobrazenie.</li>
</ul>
<h2>4. Používatelia, nastavenia a ukladanie</h2>
<ul>
  <li><strong>Úpravy používateľa sa zachovajú:</strong> Zmeny profilu vykonané na stránke detailu používateľa sa po uložení a obnovení stránky nestratia.</li>
  <li><strong>Správa všetkých účtov:</strong> Úprava ani odstránenie používateľa už nie sú omylom blokované podľa konkrétneho mena účtu.</li>
  <li><strong>Stabilný formulár e-mailových nastavení:</strong> Priebežná synchronizácia počas písania nevymaže rozpracované hodnoty.</li>
  <li><strong>Spoľahlivé uloženie zmien:</strong> Úpravy používateľa, premenovania zdrojov a kategórií sa nestrácajú pri súbežnej synchronizácii. Indikátor ukladania sa zobrazí iba pri skutočnej zmene, nebliká po načítaní a neprekrýva úspešné oznámenie.</li>
</ul>
<h2>5. Jazyk, mena a vizuálna konzistencia</h2>
<ul>
  <li><strong>Nastaviteľná mena:</strong> Symbol meny už nie je pevne viazaný na dolár alebo euro. Zobrazí sa na správnej strane hodnoty a pri sume sa nezalomí na samostatný riadok.</li>
  <li><strong>Inštalácia vo vybranom jazyku:</strong> Predvolené názvy pipeline sa vytvoria v jazyku zvolenom v inštalátore; doplnené boli aj zostávajúce texty v slovenčine a maďarčine.</li>
  <li><strong>Jednotné hlavičky stránok:</strong> Sekcie používajú rovnakú hierarchiu nadpisov a horná lišta zobrazuje iba názov značky. Názov karty prehliadača sa mení podľa otvorenej sekcie.</li>
  <li><strong>Heslá a diakritika:</strong> Každé heslové pole má ikonu na zobrazenie alebo skrytie hodnoty a tesnejšie riadkovanie už neorezáva mäkčene ani dĺžne.</li>
  <li><strong>Čitateľný štart aplikácie:</strong> Text načítavania zostáva viditeľný nad animovaným pozadím.</li>
</ul>
<h2>6. Aktualizácie, súbory a nahrávky</h2>
<ul>
  <li><strong>Nová sekcia Aktualizácie:</strong> Changelog je dostupný priamo z aplikácie, vrátane upozornenia na nový záznam a samostatnej histórie verzií.</li>
  <li><strong>Čistejší text z dokumentov:</strong> Nečitateľný binárny obsah alebo metadata PDF sa už nepridajú k nahranému dokumentu; neúspešná synchronizácia ponuky sa zobrazí namiesto tichého zmiznutia súboru.</li>
  <li><strong>Okamžité prehratie nahrávky:</strong> Čerstvo vytvorený záznam zo stretnutia sa dá prehrať ešte pred uložením celej poznámky.</li>
</ul>`,
        },
      },
      {
        __typename: "imageWithText_Entry",
        text: {
          html: `<h2>Termíny a archív úloh</h2><p>V detaile úlohy je zvýraznený výber času termínu aj samostatná akcia na archivovanie. Úloha si pritom zachová svoj pracovný stav.</p>`,
        },
        image: [{
          url: "/update-screenshots/v1-6-33-task-drawer-highlighted.png",
          title: "Vlastný čas termínu a archivovanie úlohy",
        }],
        imageDirection: true,
      },
      {
        __typename: "imageWithText_Entry",
        text: {
          html: `<h2>Kontrola synchronizácie e-mailov</h2><p>Nové tlačidlo spustí synchronizáciu schránky ručne a stavový riadok ukazuje čas poslednej synchronizácie aj automatický interval.</p>`,
        },
        image: [{
          url: "/update-screenshots/v1-6-33-email-sync-highlighted.png",
          title: "Ručná synchronizácia e-mailov a čas poslednej synchronizácie",
        }],
        imageDirection: false,
      },
    ],
  },
];

export const mergeBundledUpdateNotes = (cmsEntries: UpdateEntry[]) => {
  const cmsVersions = new Set(cmsEntries.map((entry) => entry.version));
  return [...cmsEntries, ...bundledUpdateNotes.filter((entry) => !cmsVersions.has(entry.version))]
    .sort((a, b) => new Date(b.postDate).getTime() - new Date(a.postDate).getTime());
};
