// Drives the cabinetlibrary_drawings product UI (vite dev server, default port 4200): select test order ->
// (auto calculate) -> order output (env OUTPUT, default "output_DrawingsPlanDEV"; "output_RoomDrawings" for this
// package) -> "Create order output", captures the zip, extracts it, screenshots each SVG and writes console.log
// (library errors, timing, 3D model requests).
// usage: OUTPUT=output_RoomDrawings node cl_run.mjs "<test order key>" <outDir> [baseUrl] [test-orders override.json]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const orderKey = process.argv[2];
const outDir = path.resolve(process.argv[3] ?? 'out-cl');
const baseUrl = process.argv[4] ?? 'http://127.0.0.1:4200/';
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
// count model requests per phase
let phase = 'load';
const modelRequests = { load: [], calculate: [], output: [] };
page.on('request', r => { if (/\/cdn\//.test(r.url())) modelRequests[phase].push(r.url().split('?')[0]); });

// optional: serve a modified test-orders.json (5th argument) instead of the project's file
const ordersOverride = process.argv[5];
if (ordersOverride) {
  await page.route(url => url.pathname.endsWith('/test-orders.json') && !url.search, route => route.fulfill({ contentType: 'application/json', body: fs.readFileSync(ordersOverride, 'utf8') }));
}
await page.goto(baseUrl, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelectorAll('#testOrderCb option').length > 0, null, { timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('#bomOrderOutputCb option').length > 0, null, { timeout: 120000 });
phase = 'calculate';
await page.selectOption('#testOrderCb', orderKey);
// selecting triggers the calculation; wait until the status label is hidden again
await page.waitForTimeout(500);
await page.waitForFunction(() => document.getElementById('calculate-status')?.classList.contains('lable-hidden'), null, { timeout: 300000, polling: 500 });
logs.push(`[app-errors after calculate] ${await page.$eval('#errorInfo', el => el.value)}`);
await page.selectOption('#bomOrderOutputCb', process.env.OUTPUT ?? 'output_DrawingsPlanDEV');
phase = 'output';
const t0 = Date.now();
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 600000 }),
  page.click('#createOrderBomOutput'),
]);
const zipPath = path.join(outDir, 'output.zip');
await download.saveAs(zipPath);
logs.push(`[app-errors after output] ${await page.$eval('#errorInfo', el => el.value)}`);
logs.push(`[driver] order output took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
try { execFileSync('unzip', ['-o', '-q', zipPath, '-d', outDir]); } catch (e) { logs.push(`[driver] unzip failed: ${e.message.split('\n')[0]}`); }

const svgs = fs.readdirSync(outDir).filter(f => f.endsWith('.svg')).sort();
for (const f of svgs) {
  const svg = fs.readFileSync(path.join(outDir, f), 'utf8');
  const vb = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 1600 1000').split(/\s+/).map(Number);
  // headless Chrome tiles screenshots taller than ~1100px, so cap the height
  const W = Math.floor(Math.min(1600, 1100 * vb[2] / vb[3])), H = Math.ceil(W * vb[3] / vb[2]);
  const p2 = await browser.newPage({ viewport: { width: W, height: H } });
  await p2.setContent(`<html><body style="margin:0;background:#fff">${svg.replace(/<svg /, `<svg style="width:${W}px;height:${H}px;display:block" `)}</body></html>`);
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: path.join(outDir, f.replace(/\.svg$/, '.png')) });
  await p2.close();
}
for (const [k, v] of Object.entries(modelRequests)) logs.push(`[driver] model requests during ${k}: ${v.length} (unique ${new Set(v).size})`);
fs.writeFileSync(path.join(outDir, 'console.log'), logs.join('\n'));
console.log('files:', fs.readdirSync(outDir).join(', '));
console.log(logs.filter(l => /app-errors|pageerror|driver/i.test(l)).slice(0, 40).join('\n').slice(0, 6000));
await browser.close();
