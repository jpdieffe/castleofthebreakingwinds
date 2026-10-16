// Two real browsers using the public page and public matchmaking. No game server.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.env.GAME_URL || 'https://jpdieffe.github.io/castleofthebreakingwinds/';
const browsers = [];
try {
  for (const left of [0, 880]) browsers.push(await chromium.launch({ channel: 'chrome', headless: false, args: [`--window-position=${left},20`, '--window-size=880,960'] }));
  const pages = await Promise.all(browsers.map(async b => (await b.newContext({ viewport: null })).newPage()));
  await Promise.all(pages.map(p => p.goto(url)));
  await pages[0].locator('#name').fill('Adventurer One'); await pages[0].locator('#create').click();
  await pages[0].locator('#ready').waitFor({ timeout: 30000 });
  const code = (await pages[0].locator('#room-label').innerText()).split(' ')[1];
  await pages[1].locator('#name').fill('Adventurer Two'); await pages[1].locator('#code').fill(code); await pages[1].locator('#join').click();
  await pages[1].locator('#ready').waitFor({ timeout: 30000 });
  await pages[0].locator('#ready').click(); await pages[1].locator('#ready').click();
  await Promise.all(pages.map(p => p.locator('#party-overlay').waitFor({ state: 'hidden' })));
  for (const page of pages) {
    if (!(await page.locator('#connection').innerText()).includes('WebRTC')) throw new Error('Published client did not use browser co-op.');
  }
  mkdirSync('qa/screenshots', { recursive: true }); mkdirSync('.game-data', { recursive: true });
  await pages[0].screenshot({ path: 'qa/screenshots/peer-host.png', fullPage: true });
  await pages[1].screenshot({ path: 'qa/screenshots/peer-guest.png', fullPage: true });
  writeFileSync('.game-data/peer-session.json', JSON.stringify({ pid: process.pid, url, code, started: new Date().toISOString() }, null, 2));
  console.log(`Two browser clients connected over WebRTC. Expedition: ${code}\n${url}\nNo game server is running in this launcher. Keep the host browser open. Ctrl+C closes these test clients.`);
} catch (error) { await Promise.all(browsers.map(b => b.close())); throw error; }
let closing = false;
async function close() { if (closing) return; closing = true; await Promise.all(browsers.map(b => b.close())); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
