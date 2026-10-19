// renders an SVG at high resolution and crops a region given in fractions of the sheet (viewing aid only)
// usage: node svgcrop.mjs <svg> <png> <x0> <y0> <x1> <y1> [pixelWidthOfFullSheet]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const [svgPath, pngPath, x0, y0, x1, y1, full = '6000'] = process.argv.slice(2);
const W = Number(full), H = Math.round(W * 297 / 420);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const uri = 'data:image/svg+xml;base64,' + fs.readFileSync(svgPath).toString('base64');
await page.setContent(`<body style="margin:0"><img id="i" src="${uri}" style="width:${W}px;height:${H}px;display:block"></body>`);
await page.waitForTimeout(300);
await page.screenshot({ path: pngPath, clip: { x: W * x0, y: H * y0, width: W * (x1 - x0), height: H * (y1 - y0) }, fullPage: true });
await browser.close();
