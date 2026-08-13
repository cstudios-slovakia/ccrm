#!/usr/bin/env node
/**
 * Seeds a test price offer — a real, generated PDF plus the timeline event that
 * points at it — into the LOCAL development CRM.
 *
 * It exists so the "open the price offer from a lead's timeline" path can be
 * exercised end to end without needing a customer document: the file is written
 * into uploads/ exactly the way upload.php writes one (`<eventId>_<fileName>`),
 * and the event carries the same attachments_json shape the real upload flow
 * stores. The generated file deliberately mirrors an awkward real-world name —
 * spaces and an UPPERCASE .PDF extension — because those are what the preview
 * modal has to survive.
 *
 * Usage:
 *   node scripts/seed_test_price_offer.mjs                 # newest lead in the local DB
 *   node scripts/seed_test_price_offer.mjs --lead=lead-123 # a specific lead
 *   node scripts/seed_test_price_offer.mjs --no-db         # only write the PDF
 *   node scripts/seed_test_price_offer.mjs --container=ccrm-db-1 --database=ccrm
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const [k, v] = a.replace(/^--/, "").split("=");
        return [k, v === undefined ? true : v];
    }),
);

const CONTAINER = args.container || "ccrm-db-1";
const DATABASE = args.database || "ccrm";
const DB_USER = args.user || "root";
const DB_PASS = args.password || "ccrm_root_password";

// Kept in the shape upload.php would have produced for a file a salesperson
// really attached: ccrm_safe_upload_name() collapses the en-dashes to "_" but
// keeps the spaces and the original extension casing.
const EVENT_ID = "evt-test-offer-001";
const FILE_NAME = "LAMINAM _ PONUKA _ TEST KLIENT III.PDF";
const OFFER_NUMBER = "2026/08/113";
const VAT_RATE = 0.23;

/* ------------------------------------------------------------------ *
 * Minimal PDF writer
 *
 * Enough of the format to emit a couple of text-and-rectangle pages with
 * the base-14 fonts. Slovak letters are not in WinAnsiEncoding, so every
 * non-ASCII character used is mapped to a free code point (128+) through the
 * font's /Differences array.
 * ------------------------------------------------------------------ */

const GLYPH_NAMES = {
    á: "aacute", ä: "adieresis", č: "ccaron", ď: "dcaron", é: "eacute",
    í: "iacute", ĺ: "lacute", ľ: "lcaron", ň: "ncaron", ó: "oacute",
    ô: "ocircumflex", ŕ: "racute", š: "scaron", ť: "tcaron", ú: "uacute",
    ý: "yacute", ž: "zcaron", ö: "odieresis", ü: "udieresis",
    Á: "Aacute", Ä: "Adieresis", Č: "Ccaron", Ď: "Dcaron", É: "Eacute",
    Í: "Iacute", Ĺ: "Lacute", Ľ: "Lcaron", Ň: "Ncaron", Ó: "Oacute",
    Ô: "Ocircumflex", Ŕ: "Racute", Š: "Scaron", Ť: "Tcaron", Ú: "Uacute",
    Ý: "Yacute", Ž: "Zcaron",
    "€": "Euro", "–": "endash", "—": "emdash", "“": "quotedblleft",
    "”": "quotedblright", "„": "quotedblbase", "°": "degree", "§": "section",
    "×": "multiply", "·": "periodcentered", "•": "bullet", "²": "twosuperior",
    "³": "threesuperior", "½": "onehalf", "„": "quotedblbase",
};

// Codes 128..255, handed out in first-use order and written into /Differences.
const glyphCodes = new Map();

function encodeText(str) {
    let out = "";
    for (const ch of str) {
        const code = ch.codePointAt(0);
        if (code < 128) {
            out += "()\\".includes(ch) ? "\\" + ch : ch;
            continue;
        }
        const name = GLYPH_NAMES[ch];
        if (!name) {
            out += "?"; // no glyph mapped — better a placeholder than broken bytes
            continue;
        }
        if (!glyphCodes.has(ch)) {
            const next = 128 + glyphCodes.size;
            if (next > 255) throw new Error("Ran out of /Differences slots");
            glyphCodes.set(ch, next);
        }
        out += "\\" + glyphCodes.get(ch).toString(8).padStart(3, "0");
    }
    return out;
}

// Helvetica advance widths (1/1000 em), needed so right-aligned labels and
// figures line up instead of overlapping the column next to them.
const WIDTHS = {
    " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
    "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
    ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
    A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
    J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722,
    S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
    a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
    j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
    s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
    "{": 334, "|": 260, "}": 334, "~": 584,
    "€": 556, "–": 556, "—": 1000, "·": 278, "•": 350, "°": 400, "²": 333,
    "³": 333, "×": 584, "§": 556, "“": 333, "”": 333, "„": 333, "½": 834,
};

function charWidth(ch) {
    if (WIDTHS[ch] !== undefined) return WIDTHS[ch];
    if (ch >= "0" && ch <= "9") return 556;
    // Accented letters advance like their base letter, which the Adobe glyph
    // name spells out for us ("aacute" -> "a", "Ocircumflex" -> "O").
    const base = GLYPH_NAMES[ch]?.[0];
    return (base && WIDTHS[base]) || 556;
}

// Bold advances a few percent wider than regular; close enough for alignment.
const textWidth = (str, size, bold = false) =>
    ([...str].reduce((w, ch) => w + charWidth(ch), 0) * size / 1000) * (bold ? 1.07 : 1);

const A4 = { w: 595.28, h: 841.89 };
const INK = "0.06 0.09 0.16"; // slate-900
const MUTED = "0.42 0.45 0.5";
const ACCENT = "0.72 0.32 0.11";

class Page {
    constructor() {
        this.ops = [];
    }
    rect(x, y, w, h, color) {
        this.ops.push(`${color} rg`, `${f(x)} ${f(y)} ${f(w)} ${f(h)} re f`);
        return this;
    }
    text(x, y, str, { size = 10, bold = false, color = INK } = {}) {
        this.ops.push(
            `BT ${color} rg /${bold ? "F2" : "F1"} ${f(size)} Tf 1 0 0 1 ${f(x)} ${f(y)} Tm (${encodeText(str)}) Tj ET`,
        );
        return this;
    }
    textRight(xRight, y, str, opts = {}) {
        return this.text(xRight - textWidth(str, opts.size || 10, opts.bold), y, str, opts);
    }
    stream() {
        return this.ops.join("\n");
    }
}

const f = (n) => (Math.round(n * 100) / 100).toString();
const money = (n) =>
    n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";

function buildPdf(pages) {
    const objects = []; // 1-based; objects[i] is object number i+1
    const add = (body) => {
        objects.push(body);
        return objects.length;
    };

    const pageObjNumbers = [];
    const contentObjNumbers = [];
    // Reserve: 1 catalog, 2 pages tree, then per page a page + content object,
    // then the two fonts and the encoding. Numbers are assigned as we push.
    add(""); // 1 = catalog (filled in below)
    add(""); // 2 = pages tree
    for (const page of pages) {
        const contentNum = add("");
        const pageNum = add("");
        contentObjNumbers.push(contentNum);
        pageObjNumbers.push(pageNum);
        const stream = page.stream();
        objects[contentNum - 1] =
            `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    }
    const fontRegular = add("");
    const fontBold = add("");
    const encoding = add("");

    objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
    objects[1] =
        `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjNumbers.map((n) => `${n} 0 R`).join(" ")}] >>`;
    pageObjNumbers.forEach((num, i) => {
        objects[num - 1] =
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(A4.w)} ${f(A4.h)}] ` +
            `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
            `/Contents ${contentObjNumbers[i]} 0 R >>`;
    });
    objects[fontRegular - 1] =
        `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding ${encoding} 0 R >>`;
    objects[fontBold - 1] =
        `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding ${encoding} 0 R >>`;

    // /Differences is contiguous from 128, so a single run covers every glyph.
    const names = [...glyphCodes.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([ch]) => `/${GLYPH_NAMES[ch]}`)
        .join(" ");
    objects[encoding - 1] =
        `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${names}] >>`;

    let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = [];
    objects.forEach((body, i) => {
        offsets.push(Buffer.byteLength(pdf, "latin1"));
        pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefStart = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
        pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

    return Buffer.from(pdf, "latin1");
}

/* ------------------------------------------------------------------ *
 * The offer document itself
 * ------------------------------------------------------------------ */

const ITEMS = [
    ["Laminam Calacatta Oro 1620×3240×5,6 mm", "12", "ks", 486.0],
    ["Laminam Pietra Grey 1620×3240×12 mm", "6", "ks", 742.5],
    ["Presné rezanie a kalibrácia dosiek", "38,5", "m²", 26.4],
    ["Lepenie a montáž obkladu na stenu", "38,5", "m²", 41.0],
    ["Hrany — brúsenie a leštenie 45°", "24", "bm", 18.9],
    ["Doprava a vynáška na miesto stavby", "1", "kpl", 320.0],
];

const SUBTOTAL = ITEMS.reduce((sum, [, qty, , price]) => sum + parseFloat(qty.replace(",", ".")) * price, 0);
// The timeline event shows the same figure the document's bottom line does.
const OFFER_TOTAL = SUBTOTAL * (1 + VAT_RATE);

function pageOne() {
    const p = new Page();
    const M = 48;

    p.rect(0, A4.h - 108, A4.w, 108, INK);
    p.text(M, A4.h - 52, "LAMINAM SLOVAKIA", { size: 21, bold: true, color: "1 1 1" });
    p.text(M, A4.h - 72, "Veľkoformátové keramické dosky a obklady", { size: 9, color: "0.7 0.74 0.8" });
    p.textRight(A4.w - M, A4.h - 52, "CENOVÁ PONUKA", { size: 13, bold: true, color: "1 1 1" });
    p.textRight(A4.w - M, A4.h - 70, `č. ${OFFER_NUMBER}`, { size: 10, color: "0.7 0.74 0.8" });
    p.textRight(A4.w - M, A4.h - 86, "Dátum vystavenia: 13. 08. 2026", { size: 9, color: "0.7 0.74 0.8" });

    let y = A4.h - 150;
    p.text(M, y, "DODÁVATEĽ", { size: 8, bold: true, color: MUTED });
    p.text(A4.w / 2, y, "ODBERATEĽ", { size: 8, bold: true, color: MUTED });
    y -= 16;
    const supplier = [
        "Laminam Slovakia s.r.o.",
        "Priemyselná 12, 821 09 Bratislava",
        "IČO: 51 234 567 · DIČ: 2120678901",
        "IČ DPH: SK2120678901",
        "obchod@laminam.sk · +421 911 000 111",
    ];
    const customer = [
        "Test Klient s.r.o.",
        "Hlavná 118, 040 01 Košice",
        "IČO: 47 998 221 · DIČ: 2024118877",
        "Kontakt: Ing. Erik Testovací",
        "erik@testklient.sk · +421 905 222 333",
    ];
    supplier.forEach((line, i) => p.text(M, y - i * 13, line, { size: 9, bold: i === 0 }));
    customer.forEach((line, i) => p.text(A4.w / 2, y - i * 13, line, { size: 9, bold: i === 0 }));

    y -= 5 * 13 + 26;
    p.text(M, y, "Predmet ponuky: dodávka a montáž veľkoformátového obkladu — kuchyňa a kúpeľňa, 2. NP", { size: 9, color: MUTED });

    // Items table
    y -= 26;
    const colQty = 348, colUnit = 392, colPrice = 470, colTotal = A4.w - M;
    p.rect(M, y - 6, A4.w - 2 * M, 22, "0.94 0.95 0.97");
    p.text(M + 8, y, "POLOŽKA", { size: 8, bold: true, color: MUTED });
    p.textRight(colQty, y, "MNOŽSTVO", { size: 8, bold: true, color: MUTED });
    p.text(colUnit, y, "MJ", { size: 8, bold: true, color: MUTED });
    p.textRight(colPrice, y, "CENA/MJ", { size: 8, bold: true, color: MUTED });
    p.textRight(colTotal - 8, y, "SPOLU", { size: 8, bold: true, color: MUTED });

    y -= 16;
    ITEMS.forEach(([label, qty, unit, price], i) => {
        const amount = parseFloat(qty.replace(",", ".")) * price;
        y -= 24;
        if (i % 2 === 1) p.rect(M, y - 7, A4.w - 2 * M, 24, "0.98 0.98 0.99");
        p.text(M + 8, y, label, { size: 9 });
        p.textRight(colQty, y, qty, { size: 9 });
        p.text(colUnit, y, unit, { size: 9, color: MUTED });
        p.textRight(colPrice, y, money(price), { size: 9 });
        p.textRight(colTotal - 8, y, money(amount), { size: 9, bold: true });
    });

    y -= 34;
    p.rect(M, y + 12, A4.w - 2 * M, 1, "0.85 0.87 0.9");
    const rows = [
        ["Medzisúčet bez DPH", money(SUBTOTAL), false],
        [`DPH ${VAT_RATE * 100} %`, money(SUBTOTAL * VAT_RATE), false],
        ["CELKOM K ÚHRADE", money(OFFER_TOTAL), true],
    ];
    rows.forEach(([label, value, strong], i) => {
        const ry = y - i * 20;
        p.textRight(colPrice - 8, ry, label, { size: strong ? 10 : 9, bold: strong, color: strong ? INK : MUTED });
        p.textRight(colTotal - 8, ry, value, { size: strong ? 12 : 9, bold: strong, color: strong ? ACCENT : INK });
    });

    y -= 3 * 20 + 24;
    p.rect(M, y - 44, A4.w - 2 * M, 56, "0.98 0.96 0.93");
    p.text(M + 12, y - 8, "Platnosť ponuky: 30 dní od dátumu vystavenia.", { size: 9, bold: true });
    p.text(M + 12, y - 24, "Termín dodania: 4–6 týždňov od potvrdenia objednávky a úhrady zálohy 50 %.", { size: 9 });
    p.text(M + 12, y - 38, "Cena zahŕňa dopravu, montáž a odvoz odpadu. Nezahŕňa stavebné prípravy.", { size: 9 });

    p.text(M, 48, "Laminam Slovakia s.r.o. · IČO 51 234 567 · Zapísaná v OR OS Bratislava I, oddiel Sro", { size: 7.5, color: MUTED });
    p.textRight(A4.w - M, 48, "Strana 1 / 2", { size: 7.5, color: MUTED });
    return p;
}

function pageTwo() {
    const p = new Page();
    const M = 48;
    let y = A4.h - 80;

    p.text(M, y, "OBCHODNÉ PODMIENKY", { size: 14, bold: true });
    p.rect(M, y - 12, 64, 2.5, ACCENT);

    const terms = [
        ["1. Platobné podmienky", [
            "Záloha 50 % z celkovej ceny je splatná do 7 dní od potvrdenia objednávky.",
            "Doplatok je splatný do 14 dní od odovzdania diela na základe faktúry.",
        ]],
        ["2. Dodacie podmienky", [
            "Dodacia lehota začína plynúť dňom pripísania zálohy na účet dodávateľa.",
            "Miesto plnenia je adresa odberateľa uvedená v tejto ponuke.",
        ]],
        ["3. Záruka", [
            "Na dodaný materiál poskytujeme záruku 24 mesiacov, na montážne práce 60 mesiacov.",
            "Záruka sa nevzťahuje na poškodenie spôsobené nesprávnym užívaním alebo údržbou.",
        ]],
        ["4. Odstúpenie od zmluvy", [
            "Odberateľ môže od objednávky odstúpiť do 3 dní od jej potvrdenia bez sankcie.",
            "Po zahájení výroby na mieru je záloha nevratná v rozsahu vynaložených nákladov.",
        ]],
        ["5. Ochrana údajov", [
            "Osobné údaje spracúvame výhradne na účely plnenia tejto ponuky a zmluvy.",
        ]],
    ];

    y -= 34;
    for (const [heading, lines] of terms) {
        p.text(M, y, heading, { size: 10, bold: true });
        y -= 15;
        for (const line of lines) {
            p.text(M + 10, y, line, { size: 9, color: "0.25 0.28 0.34" });
            y -= 13;
        }
        y -= 12;
    }

    y -= 10;
    p.rect(M, y - 58, A4.w - 2 * M, 74, "0.96 0.97 1");
    p.text(M + 14, y - 4, "TESTOVACÍ DOKUMENT", { size: 10, bold: true, color: ACCENT });
    p.text(M + 14, y - 22, "Tento súbor vygeneroval scripts/seed_test_price_offer.mjs pre lokálne testovanie", { size: 9 });
    p.text(M + 14, y - 36, "náhľadu PDF v časovej osi dopytu. Neobsahuje žiadne skutočné údaje klienta", { size: 9 });
    p.text(M + 14, y - 50, "a nie je platnou cenovou ponukou.", { size: 9 });

    y -= 110;
    p.rect(M, y, 170, 1, "0.6 0.63 0.68");
    p.rect(A4.w - M - 170, y, 170, 1, "0.6 0.63 0.68");
    p.text(M, y - 14, "Za dodávateľa", { size: 8, color: MUTED });
    p.textRight(A4.w - M, y - 14, "Za odberateľa", { size: 8, color: MUTED });

    p.text(M, 48, `Cenová ponuka č. ${OFFER_NUMBER}`, { size: 7.5, color: MUTED });
    p.textRight(A4.w - M, 48, "Strana 2 / 2", { size: 7.5, color: MUTED });
    return p;
}

/* ------------------------------------------------------------------ *
 * Write the file, then point a timeline event at it
 * ------------------------------------------------------------------ */

const pdf = buildPdf([pageOne(), pageTwo()]);
const uploadsDir = join(ROOT, "uploads");
mkdirSync(uploadsDir, { recursive: true });
const target = join(uploadsDir, `${EVENT_ID}_${FILE_NAME}`);
writeFileSync(target, pdf);
const sizeLabel = `${(statSync(target).size / 1024).toFixed(0)} KB`;
console.log(`PDF written: ${target} (${sizeLabel})`);

if (args["no-db"]) {
    console.log("--no-db given — timeline event not inserted.");
    process.exit(0);
}

const mysql = (sql, extraFlags = []) =>
    execFileSync(
        "docker",
        ["exec", "-i", CONTAINER, "mysql", `-u${DB_USER}`, `-p${DB_PASS}`, ...extraFlags, DATABASE],
        { input: Buffer.from(sql, "utf8"), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );

let leadId = args.lead;
if (!leadId) {
    const rows = mysql(
        "SELECT id FROM leads ORDER BY created_at DESC, id DESC LIMIT 1;",
        ["-N", "-B"],
    ).trim();
    if (!rows) {
        console.error("No leads found in the local database — pass --lead=<id> or create one first.");
        process.exit(1);
    }
    leadId = rows.split(/\s+/)[0];
}

const attachments = JSON.stringify([
    { name: FILE_NAME, size: sizeLabel, path: `/uploads/${EVENT_ID}_${FILE_NAME}` },
]);
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "''");

const sql = `
SET NAMES utf8mb4;
DELETE FROM timeline_events WHERE id = '${esc(EVENT_ID)}';
INSERT INTO timeline_events
  (id, lead_id, type, timestamp, title, content, amount, file_name, file_size, file_type, attachments_json)
VALUES
  ('${esc(EVENT_ID)}', '${esc(leadId)}', 'offer', NOW(),
   'Cenová ponuka č. ${esc(OFFER_NUMBER)} (testovacia)',
   'Testovacia cenová ponuka vygenerovaná pre overenie náhľadu PDF v časovej osi. Obsahuje dve strany, tabuľku položiek a slovenskú diakritiku.',
   ${OFFER_TOTAL.toFixed(2)}, '${esc(FILE_NAME)}', '${esc(sizeLabel)}', 'offer',
   '${esc(attachments)}');
`;

mysql(sql);
console.log(`Timeline event '${EVENT_ID}' attached to lead '${leadId}'.`);
console.log("Open the lead's timeline and click the attached document to preview it.");
