import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTML_FILE = path.resolve('presentation/index.html');
const OUTPUT_PDF = path.resolve('presentation/Koperniq_Prezentacia_Software_Solutions.pdf');
const LEGACY_PDF = path.resolve('presentation/CCRM_Prezentacia_Software_Solutions.pdf');

async function exportPDF() {
  console.log("Generating PDF from:", HTML_FILE);
  console.log("Output PDF target:", OUTPUT_PDF);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.goto(`file://${HTML_FILE}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000)); // Ensure fonts & images are fully decoded

  await page.pdf({
    path: OUTPUT_PDF,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    preferCSSPageSize: true
  });

  fs.copyFileSync(OUTPUT_PDF, LEGACY_PDF);

  console.log("PDF generated successfully!");
  const stats = fs.statSync(OUTPUT_PDF);
  console.log(`PDF Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  await browser.close();
}

exportPDF().catch(err => {
  console.error("PDF export failed:", err);
  process.exit(1);
});
