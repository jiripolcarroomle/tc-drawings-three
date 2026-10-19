// Review PDFs of the room-drawings output (viewing aid only):
//  1) room-drawings-sheets.pdf   - every sheet of every order at true size (A3 landscape, one per page)
//  2) room-drawings-old-vs-new.pdf - per view: old output_DrawingsPlanDEV drawing above, new sheet below (A3 portrait)
// usage: node build_sheets_pdf.mjs <newDir> <oldDir> <outDir>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [NEW, OLD, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const ORDERS = {
  '10000071': 'TestLW', '10000099': 'DKG', '10000108': 'Jiri Drawing Test', '10000108-baseboard-legs': 'Jiri Drawing Test, baseboard + legs',
  '10000113': 'Test Sr', '10000125': 'Hendrik Test', '10000128': 'orderManager order', '10000129': 'Jiri Drawing Test 2',
  '10000130': 'JP Drawing Test 3', '10000130-baseboard-legs': 'JP Drawing Test 3, baseboard + legs',
};
const rank = f => (f === 'overview.svg' ? '0' : f === 'topview.svg' ? '1' : '2') + f;
const uri = file => 'data:image/svg+xml;base64,' + fs.readFileSync(file).toString('base64');
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const sheets = [], pairs = [];
for (const [id, name] of Object.entries(ORDERS)) {
  const dir = path.join(NEW, id);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.svg')).sort((a, b) => rank(a).localeCompare(rank(b)))) {
    sheets.push(`<div class="sheet"><img src="${uri(path.join(dir, f))}"></div>`);
    const old = path.join(OLD, id, f);
    if (f !== 'overview.svg' && fs.existsSync(old)) {
      pairs.push(`<div class="pair"><h1>${esc(id)} ${esc(name)} — ${esc(f.replace('.svg', ''))}</h1>`
        + `<h2>Before: output_DrawingsPlanDEV</h2><div class="old"><img src="${uri(old)}"></div>`
        + `<h2>After: output_RoomDrawings</h2><div class="new"><img src="${uri(path.join(dir, f))}"></div></div>`);
    }
  }
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setContent(`<style>@page{size:420mm 297mm;margin:0}body{margin:0}.sheet{width:420mm;height:297mm;page-break-after:always;overflow:hidden}.sheet img{width:420mm;height:297mm;display:block}</style>${sheets.join('')}`, { waitUntil: 'load' });
await page.pdf({ path: path.join(OUT, 'room-drawings-sheets.pdf'), width: '420mm', height: '297mm', printBackground: true });
await page.setContent(`<style>@page{size:297mm 420mm;margin:10mm}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#222}.pair{height:398mm;page-break-after:always;display:flex;flex-direction:column}h1{font-size:15px;margin:0 0 4mm}h2{font-size:12px;margin:3mm 0 2mm;color:#555}.old,.new{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;border:1px solid #ddd}.old img,.new img{max-width:100%;max-height:100%}</style>${pairs.join('')}`, { waitUntil: 'load' });
await page.pdf({ path: path.join(OUT, 'room-drawings-old-vs-new.pdf'), width: '297mm', height: '420mm', printBackground: true });
await browser.close();
console.log(`${sheets.length} sheets, ${pairs.length} comparisons`);
