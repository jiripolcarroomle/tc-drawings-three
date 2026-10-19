// screenshots every SVG in the given folders (viewing aid only)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const dir of process.argv.slice(2)) for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg'))) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 990 } });
  const uri = 'data:image/svg+xml;base64,' + Buffer.from(fs.readFileSync(path.join(dir, f))).toString('base64');
  await page.setContent(`<body style="margin:0"><img src="${uri}" style="width:1400px;height:990px;display:block"></body>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(dir, f.replace('.svg', '.png')) });
  await page.close();
}
await browser.close();
