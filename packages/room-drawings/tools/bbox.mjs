// prints the bounding box of the drawn views (+ captions) of each SVG sheet, in sheet millimetres
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
const result = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg'))) {
  await page.setContent(fs.readFileSync(path.join(dir, f), 'utf8'));
  result[f] = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    const els = [...svg.querySelectorAll(':scope > g.view, :scope > text')];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const ctm = svg.getScreenCTM().inverse();
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const p1 = new DOMPoint(r.left, r.top).matrixTransform(ctm), p2 = new DOMPoint(r.right, r.bottom).matrixTransform(ctm);
      minX = Math.min(minX, p1.x); minY = Math.min(minY, p1.y); maxX = Math.max(maxX, p2.x); maxY = Math.max(maxY, p2.y);
    }
    return [minX, minY, maxX, maxY].map(v => +v.toFixed(1));
  });
}
console.log(JSON.stringify(result));
await browser.close();
