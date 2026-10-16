/**
 * The quote on the login screen.
 *
 * A curated list rather than a quote API: no public API serves Slovak or
 * Hungarian, and the login screen should not depend on a third party being up.
 * Every entry is a real quote with a well-established author, translated into
 * all three app languages. Misattributed internet favourites are deliberately
 * left out.
 *
 * One quote per calendar day, the same for everyone; the refresh button on the
 * login screen steps through the rest.
 */

export type QuoteLanguage = "en" | "sk" | "hu";

export interface LoginQuote {
  text: Record<QuoteLanguage, string>;
  author: Record<QuoteLanguage, string>;
}

const same = (name: string): Record<QuoteLanguage, string> => ({ en: name, sk: name, hu: name });

const LAO_TZU = { en: "Lao Tzu", sk: "Lao-c’", hu: "Lao-ce" };
const SENECA = same("Seneca");
const MARCUS = same("Marcus Aurelius");

export const LOGIN_QUOTES: LoginQuote[] = [
  {
    text: {
      en: "Nature does not hurry, yet everything is accomplished.",
      sk: "Príroda sa neponáhľa, a predsa je všetko vykonané.",
      hu: "A természet nem siet, mégis minden megvalósul."
    },
    author: LAO_TZU
  },
  {
    text: {
      en: "A journey of a thousand miles begins with a single step.",
      sk: "Aj cesta dlhá tisíc míľ sa začína prvým krokom.",
      hu: "Az ezer mérföldes utazás is egyetlen lépéssel kezdődik."
    },
    author: LAO_TZU
  },
  {
    text: {
      en: "Well begun is half done.",
      sk: "Dobre začaté je napoly hotové.",
      hu: "A jó kezdet fél siker."
    },
    author: { en: "Aristotle", sk: "Aristoteles", hu: "Arisztotelész" }
  },
  {
    text: {
      en: "The beginning is the most important part of the work.",
      sk: "Začiatok je najdôležitejšou časťou diela.",
      hu: "A kezdet a mű legfontosabb része."
    },
    author: { en: "Plato", sk: "Platón", hu: "Platón" }
  },
  {
    text: {
      en: "While we are postponing, life speeds by.",
      sk: "Kým odkladáme, život uteká.",
      hu: "Míg halogatunk, elfut az élet."
    },
    author: SENECA
  },
  {
    text: {
      en: "It is not that we have a short time to live, but that we waste a lot of it.",
      sk: "Nemáme málo času, ale veľa ho premárnime.",
      hu: "Nem kevés időnk van, hanem sokat elvesztegetünk belőle."
    },
    author: SENECA
  },
  {
    text: {
      en: "Difficulties strengthen the mind, as labour does the body.",
      sk: "Ťažkosti posilňujú ducha tak, ako práca posilňuje telo.",
      hu: "A nehézségek erősítik az elmét, ahogy a munka a testet."
    },
    author: SENECA
  },
  {
    text: {
      en: "Begin at once to live.",
      sk: "Začni žiť hneď teraz.",
      hu: "Kezdj el élni most azonnal."
    },
    author: SENECA
  },
  {
    text: {
      en: "The happiness of your life depends upon the quality of your thoughts.",
      sk: "Šťastie tvojho života závisí od kvality tvojich myšlienok.",
      hu: "Életed boldogsága gondolataid minőségétől függ."
    },
    author: MARCUS
  },
  {
    text: {
      en: "Waste no more time arguing what a good man should be. Be one.",
      sk: "Nestrácaj už čas dohadovaním, aký má byť dobrý človek. Buď ním.",
      hu: "Ne vesztegesd tovább az időt azon vitatkozva, milyen a jó ember. Légy az."
    },
    author: MARCUS
  },
  {
    text: {
      en: "Very little is needed to make a happy life.",
      sk: "Na šťastný život treba veľmi málo.",
      hu: "Nagyon kevés kell a boldog élethez."
    },
    author: MARCUS
  },
  {
    text: {
      en: "No man ever steps in the same river twice.",
      sk: "Nikto nevstúpi dvakrát do tej istej rieky.",
      hu: "Senki sem léphet kétszer ugyanabba a folyóba."
    },
    author: { en: "Heraclitus", sk: "Herakleitos", hu: "Hérakleitosz" }
  },
  {
    text: {
      en: "First say to yourself what you would be; and then do what you have to do.",
      sk: "Najprv si povedz, kým chceš byť, a potom rob, čo musíš.",
      hu: "Először mondd meg magadnak, mi akarsz lenni, aztán tedd, amit tenned kell."
    },
    author: { en: "Epictetus", sk: "Epiktétos", hu: "Epiktétosz" }
  },
  {
    text: {
      en: "Real knowledge is to know the extent of one’s ignorance.",
      sk: "Skutočné poznanie je poznať hranice vlastnej nevedomosti.",
      hu: "Az igazi tudás az, ha ismerjük tudatlanságunk határait."
    },
    author: { en: "Confucius", sk: "Konfucius", hu: "Konfuciusz" }
  },
  {
    text: {
      en: "Dripping water hollows out stone.",
      sk: "Kvapka vody vyhĺbi kameň.",
      hu: "A csepp is kivájja a követ."
    },
    author: { en: "Ovid", sk: "Ovídius", hu: "Ovidius" }
  },
  {
    text: {
      en: "Slow and steady wins the race.",
      sk: "Pomaly ďalej zájdeš.",
      hu: "Lassan járj, tovább érsz."
    },
    author: { en: "Aesop", sk: "Ezop", hu: "Aiszóposz" }
  },
  {
    text: {
      en: "Well done is better than well said.",
      sk: "Dobre urobené je lepšie než dobre povedané.",
      hu: "A jól megtett dolog többet ér a jól elmondottnál."
    },
    author: same("Benjamin Franklin")
  },
  {
    text: {
      en: "Knowing is not enough; we must apply. Willing is not enough; we must do.",
      sk: "Nestačí vedieť, treba aj použiť. Nestačí chcieť, treba aj konať.",
      hu: "Nem elég tudni, alkalmazni is kell. Nem elég akarni, tenni is kell."
    },
    author: same("Johann Wolfgang von Goethe")
  },
  {
    text: {
      en: "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.",
      sk: "Dokonalosť sa nedosahuje vtedy, keď už niet čo pridať, ale keď už niet čo odobrať.",
      hu: "A tökéletességet nem akkor érjük el, amikor már nincs mit hozzátenni, hanem amikor már nincs mit elvenni."
    },
    author: same("Antoine de Saint-Exupéry")
  },
  {
    text: {
      en: "Alone we can do so little; together we can do so much.",
      sk: "Sami dokážeme tak málo, spolu tak veľa.",
      hu: "Egyedül olyan keveset tehetünk, együtt nagyon sokat."
    },
    author: same("Helen Keller")
  },
  {
    text: {
      en: "There is no substitute for hard work.",
      sk: "Poctivú prácu nič nenahradí.",
      hu: "A kemény munkát semmi sem pótolja."
    },
    author: same("Thomas Edison")
  },
  {
    text: {
      en: "Do what you can, with what you have, where you are.",
      sk: "Urob, čo môžeš, s tým, čo máš, tam, kde si.",
      hu: "Tedd, amit tudsz, azzal, amid van, ott, ahol vagy."
    },
    author: same("Theodore Roosevelt")
  },
  {
    text: {
      en: "Believe, love, work.",
      sk: "Veriť, milovať, pracovať.",
      hu: "Hinni, szeretni, dolgozni."
    },
    author: same("Milan Rastislav Štefánik")
  }
];

/** Whole days since the Unix epoch in local time, so the quote turns over at local midnight. */
const localDayNumber = (date: Date): number =>
  Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);

/** Index of today's quote. `offset` is how many times the user pressed "another quote". */
export const quoteIndexFor = (date: Date, offset = 0, count = LOGIN_QUOTES.length): number => {
  if (count <= 0) return 0;
  const raw = (localDayNumber(date) + offset) % count;
  return raw < 0 ? raw + count : raw;
};

export const quoteFor = (
  date: Date,
  lang: string,
  offset = 0
): { text: string; author: string } => {
  const quote = LOGIN_QUOTES[quoteIndexFor(date, offset)];
  const key: QuoteLanguage = lang === "sk" || lang === "hu" ? lang : "en";
  return { text: quote.text[key], author: quote.author[key] };
};
