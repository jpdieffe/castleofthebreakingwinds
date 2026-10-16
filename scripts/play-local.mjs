// Run the built game and open two independent, visible Chrome clients.
import { chromium } from '@playwright/test';
import { once } from 'node:events';
import { networkInterfaces } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGameServer } from '../server/index.ts';

const port = Number(process.env.PORT || 8787);
const app = createGameServer({ port });
await once(app.server, 'listening');
const address = Object.values(networkInterfaces()).flat().find(n => n && n.family === 'IPv4' && !n.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address))?.address;
const url = `http://${address || 'localhost'}:${port}/`;
const browsers = [];
try {
  for (const left of [0, 880]) browsers.push(await chromium.launch({ channel: 'chrome', headless: false, args: [`--window-position=${left},20`, '--window-size=880,960'] }));
  const pages = [];
  for (const browser of browsers) { const context = await browser.newContext({ viewport: null }); pages.push(await context.newPage()); }
  await Promise.all(pages.map(page => page.goto(url)));
  await pages[0].locator('#name').fill('Adventurer One'); await pages[0].locator('#create').click();
  await pages[0].locator('#ready').waitFor();
  const code = (await pages[0].locator('#room-label').innerText()).split(' ')[1];
  await pages[1].locator('#name').fill('Adventurer Two'); await pages[1].locator('#code').fill(code); await pages[1].locator('#join').click();
  await pages[1].locator('#ready').waitFor();
  await pages[0].locator('#ready').click(); await pages[1].locator('#ready').click();
  await Promise.all(pages.map(page => page.locator('#party-overlay').waitFor({ state: 'hidden' })));
  mkdirSync('qa/screenshots', { recursive: true });
  await pages[0].screenshot({ path: 'qa/screenshots/local-client-one.png', fullPage: true });
  await pages[1].screenshot({ path: 'qa/screenshots/local-client-two.png', fullPage: true });
  writeFileSync('.game-data/local-session.json', JSON.stringify({ pid: process.pid, url, code, started: new Date().toISOString() }, null, 2));
  console.log(`Two clients are open. Expedition: ${code}\nThis computer: http://localhost:${port}/\nLocal network: ${url}\nKeep this process running. Ctrl+C stops the server and clients.`);
} catch (error) {
  await Promise.all(browsers.map(browser => browser.close())); await app.close(); throw error;
}
let closing = false;
async function close() { if (closing) return; closing = true; await Promise.all(browsers.map(browser => browser.close())); await app.close(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
