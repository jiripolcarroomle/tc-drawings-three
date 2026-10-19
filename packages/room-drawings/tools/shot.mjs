// full-page screenshot of a local HTML file at a viewport width; reports horizontal overflow
// usage: node shot.mjs <file.html> <out.png> <width>
import { chromium } from 'playwright-core';
const [file, out, width] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
await page.goto('file://' + file, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log('horizontal overflow:', overflow);
await browser.close();
