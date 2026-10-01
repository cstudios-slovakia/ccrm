import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = 'http://localhost:8085';
const SCREENSHOT_DIR = path.resolve('presentation/screenshots');

async function test() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await page.waitForTimeout ? page.waitForTimeout(2000) : new Promise(r => setTimeout(r, 2000));

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00_initial.png') });
  console.log("Screenshot saved: 00_initial.png");

  // Check if we are on Login page or Main page
  const title = await page.title();
  console.log("Page title:", title);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("Body preview:", bodyText);

  await browser.close();
}

test().catch(console.error);
