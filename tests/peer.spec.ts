import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createGame, addPlayer } from '../shared/engine';
import { arena } from './fixtures';
import { clickTile } from './aim';
import type { GameState } from '../shared/types';

const url = 'http://localhost:5173/castleofthebreakingwinds/';
let contexts: BrowserContext[];
test.beforeEach(() => { contexts = []; });
test.afterEach(async () => { await Promise.all(contexts.map(c => c.close())); });
test.setTimeout(90000);

async function client(browser: Browser, name: string) {
  const context = await browser.newContext(); contexts.push(context);
  await context.addInitScript(() => {
    const peers: RTCPeerConnection[] = [], channels: RTCDataChannel[] = [];
    const sockets: WebSocket[] = [], workers: Worker[] = [];
    Object.assign(window, { testPeers: peers, testChannels: channels, testSockets: sockets, testWorkers: workers });
    const OriginalSocket = window.WebSocket, OriginalWorker = window.Worker;
    window.WebSocket = class extends OriginalSocket { constructor(...args: ConstructorParameters<typeof WebSocket>) { super(...args); sockets.push(this); } };
    window.Worker = class extends OriginalWorker { constructor(...args: ConstructorParameters<typeof Worker>) { super(...args); workers.push(this); } };
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(...args: ConstructorParameters<typeof RTCPeerConnection>) { super(...args); peers.push(this); }
      override createDataChannel(label: string, options?: RTCDataChannelInit) { const channel = super.createDataChannel(label, options); channels.push(channel); return channel; }
    };
  });
  const page = await context.newPage(); await page.goto(url); await page.locator('#name').fill(name); return page;
}
async function pair(browser: Browser, fixture?: (game: GameState) => void) {
  const a = await client(browser, 'Astrid'), b = await client(browser, 'Bjorn');
  if (fixture) {
    const code = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
    const game = createGame(code, 42); addPlayer(game, 'host-test', 'Astrid'); fixture(game);
    await a.evaluate(({ game }) => {
      sessionStorage.setItem('castle-peer-host-v1', JSON.stringify({ game, token: 'host-test-token' }));
      sessionStorage.setItem('castle-session', JSON.stringify({ code: game.code, token: 'host-test-token', playerId: 'host-test', server: 'peer' }));
    }, { game });
    await a.reload();
  } else await a.locator('#create').click();
  await expect(a.locator('#ready')).toBeVisible({ timeout: 25000 });
  const code = (await a.locator('#room-label').innerText()).split(' ')[1];
  await b.locator('#code').fill(code); await b.locator('#join').click();
  await expect(b.locator('#ready')).toBeVisible({ timeout: 25000 });
  await a.locator('#ready').click(); await b.locator('#ready').click();
  await expect(a.locator('#simulation-status')).toHaveText('REAL TIME');
  await expect(b.locator('#simulation-status')).toHaveText('REAL TIME');
  return { a, b, code };
}
async function saved(page: Page) { return page.evaluate(() => JSON.parse(sessionStorage.getItem('castle-peer-host-v1')!).game as GameState); }
async function key(page: Page, value: string) { await page.locator('#world').focus(); await page.keyboard.press(value); }
function chamber(game: GameState) { game.levels[0] = arena(); Object.assign(game.players[0], { x: 5, y: 5 }); }

test('public matchmaking connects two browsers over real WebRTC; both walk and share the recovered world', async ({ browser }, info) => {
  const { a, b } = await pair(browser);
  await expect(a.locator('#connection')).toContainText('WebRTC');
  await expect(b.locator('#party')).toContainText('Astrid');
  await key(a, 'ArrowRight'); await expect(a.locator('#position')).toHaveAttribute('data-x', '19');
  await key(b, 'ArrowLeft'); await expect(b.locator('#position')).toHaveAttribute('data-x', '16');
  const stats = await b.evaluate(async () => {
    const peers = (window as unknown as { testPeers: RTCPeerConnection[] }).testPeers;
    const reports = await Promise.all(peers.map(p => p.getStats()));
    return reports.flatMap(r => [...r.values()]).filter(r => r.type === 'data-channel' || r.type === 'candidate-pair');
  });
  expect(stats.some(s => s.type === 'data-channel' && s.state === 'open' && s.messagesReceived > 0 && s.messagesSent > 0)).toBeTruthy();
  expect(stats.some(s => s.type === 'candidate-pair' && s.state === 'succeeded')).toBeTruthy();
  await a.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await a.locator('#share').click();
  const invite = new URL(await a.evaluate(() => navigator.clipboard.readText()));
  expect(invite.searchParams.get('room')).toBe((await a.locator('#room-label').innerText()).split(' ')[1]);
  expect([...invite.searchParams.keys()]).toEqual(['room']);
  await a.screenshot({ path: info.outputPath('peer-host.png'), fullPage: true });
  await b.screenshot({ path: info.outputPath('peer-guest.png'), fullPage: true });
});

test('unknown rooms and full rooms do not disrupt the expedition', async ({ browser }) => {
  const { a, code } = await pair(browser), c = await client(browser, '<img src=x>');
  await c.locator('#code').fill('000000'); await c.locator('#join').click();
  await expect(c.locator('#lobby-status')).toContainText('not found', { timeout: 25000 });
  await c.locator('#code').fill(code); await c.locator('#join').click();
  await expect(c.locator('#lobby-status')).toContainText('two players', { timeout: 25000 });
  await expect(a.locator('#simulation-status')).toHaveText('REAL TIME');
});

test('guest refresh restores identity and host refresh restores world and reconnects the guest', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await key(b, 'ArrowLeft'); await expect(b.locator('#position')).toHaveAttribute('data-x', '16');
  const identity = await b.evaluate(() => sessionStorage.getItem('castle-session'));
  await b.reload(); await expect(b.locator('#simulation-status')).toHaveText('REAL TIME', { timeout: 25000 });
  expect(await b.evaluate(() => sessionStorage.getItem('castle-session'))).toBe(identity);
  await expect(b.locator('#position')).toHaveAttribute('data-x', '16');
  await expect.poll(async () => (await saved(a)).players[1].x).toBe(16);
  await a.reload(); await expect(a.locator('#simulation-status')).toHaveText('REAL TIME', { timeout: 30000 });
  await expect(b.locator('#simulation-status')).toHaveText('REAL TIME', { timeout: 30000 });
  await expect(b.locator('#position')).toHaveAttribute('data-x', '16');
});

test('disconnect pauses simulation, reserves the guest seat, and resumes with its token', async ({ browser }) => {
  const { a, b, code } = await pair(browser);
  const identity = await b.evaluate(() => sessionStorage.getItem('castle-session')!);
  await b.close(); await expect(a.locator('#simulation-status')).toContainText('PAUSED', { timeout: 15000 });
  await a.waitForTimeout(2100); const before = (await saved(a)).time;
  await a.waitForTimeout(2200); expect((await saved(a)).time).toBe(before);
  const c = await client(browser, 'Replacement'); await c.locator('#code').fill(code); await c.locator('#join').click();
  await expect(c.locator('#lobby-status')).toContainText('two players', { timeout: 25000 });
  await c.evaluate(value => sessionStorage.setItem('castle-session', value), identity); await c.reload();
  await expect(c.locator('#simulation-status')).toHaveText('REAL TIME', { timeout: 25000 });
  await expect(a.locator('#simulation-status')).toHaveText('REAL TIME');
});

test('guest can leave and a new companion joins; host Leave ends the guest session', async ({ browser }) => {
  const { a, b, code } = await pair(browser);
  await b.locator('#leave').click(); await expect(a.locator('.player-card')).toHaveCount(1);
  await b.locator('#name').fill('New companion'); await b.locator('#code').fill(code); await b.locator('#join').click();
  await expect(b.locator('#ready')).toBeVisible({ timeout: 25000 }); await b.locator('#ready').click();
  await expect(a.locator('#simulation-status')).toHaveText('REAL TIME');
  await expect(a.locator('#party')).toContainText('New companion');
  await a.locator('#leave').click(); await expect(b.locator('#toast')).toContainText('host ended');
  expect(await a.evaluate(() => sessionStorage.getItem('castle-peer-host-v1'))).toBeNull();
});

test('enemies move without input and guest spell damage, shared experience and loot synchronize', async ({ browser }) => {
  const { a, b } = await pair(browser, game => {
    chamber(game); game.levels[0].enemies.push({ id: 'rat', name: 'Giant Rat', icon: 387, x: 5, y: 9, hp: 14, maxHp: 14, damage: 1, nextMove: 500 });
  });
  await expect.poll(async () => (await saved(a)).levels[0].enemies[0].y, { timeout: 6000 }).toBeLessThan(9);
  await key(b, 'ArrowRight'); await expect(b.locator('#position')).toHaveAttribute('data-x', '5'); await b.waitForTimeout(350);
  await key(b, '1'); await clickTile(b, 5, 9);
  await expect(a.locator('#log')).toContainText('Experience is shared');
  await expect(b.locator('#log')).toContainText('Experience is shared');
  await expect(b.locator('.player-card.you .mana')).toContainText('27/30');
});

test('guest purchases and healing update both browsers from host authority', async ({ browser }) => {
  const { a, b } = await pair(browser, game => { chamber(game); game.levels[0].shop = { x: 5, y: 5 }; game.players[0].hp = 10; });
  await key(a, '2'); await expect(b.locator('.player-card').first().locator('.health')).toContainText('30/60');
  await a.locator('[data-dialog="inventory"]').click();
  await b.locator('[data-dialog="inventory"]').click(); await b.getByRole('button', { name: /Healing potion/ }).click();
  await expect(a.locator('.player-card').nth(1)).toContainText('10 gold');
  await expect(a.locator('.player-card').nth(1)).toContainText('4 potions');
  await expect(b.locator('[data-potion=potion]')).toContainText('Quantity: 4');
  await expect(b.locator('[data-slot=purse]')).toContainText('10 gold');
  await expect(a.locator('[data-slot=purse]')).toContainText('20 gold');
  await expect(a.locator('[data-potion=potion]')).toContainText('Quantity: 3');
  await a.waitForTimeout(350); await a.getByRole('button', { name: 'Drink healing potion' }).click();
  await expect(b.locator('.player-card').first().locator('.health')).toContainText('60/60');
  await expect(a.locator('[data-potion=potion]')).toContainText('Quantity: 2');
  await expect(a.getByRole('button', { name: 'Drink healing potion' })).toBeDisabled();
});

test('unmodified campaign transitions to the mine in both WebRTC clients', async ({ browser }) => {
  const { a, b } = await pair(browser);
  for (let i = 0; i < 19; i++) { await Promise.all([key(a, 'ArrowUp'), key(b, 'ArrowUp')]); await a.waitForTimeout(340); }
  await key(a, 'e'); await expect(a.locator('#location')).toHaveText('Abandoned mine \u00b7 1'); await expect(b.locator('#location')).toHaveText('Abandoned mine \u00b7 1');
});

test('guest revives the fallen host and synchronizes the potion cost', async ({ browser }) => {
  const { a, b } = await pair(browser, game => { chamber(game); game.players[0].hp = 0; });
  await key(b, 'r');
  await expect(a.locator('.player-card').first().locator('.health')).toContainText('30/60');
  await expect(a.locator('.player-card').nth(1)).toContainText('2 potions');
  await expect(b.locator('#log')).toContainText('revives');
});

test('boss victory and restart are shared across the data channel', async ({ browser }) => {
  const { a, b } = await pair(browser, game => {
    chamber(game); game.levels[0].enemies.push({ id: 'boss', name: 'Hrungnir', boss: true, icon: 429, x: 6, y: 5, hp: 14, maxHp: 14, damage: 1, nextMove: 999999 });
  });
  await key(b, '1'); await clickTile(b, 6, 5); await expect(a.locator('#simulation-status')).toHaveText('VENGEANCE IS YOURS');
  await expect(b.locator('#restart')).toBeVisible(); await b.locator('#restart').click();
  await expect(a.locator('#ready')).toBeVisible(); await expect(b.locator('#ready')).toBeVisible();
  await expect(a.locator('#location')).toHaveText('The northern hamlet');
});

test('background host keeps ticking and independent rooms remain isolated', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const second = await pair(browser);
  await expect.poll(async () => (await saved(a)).time).toBeGreaterThan(1000);
  const before = (await saved(a)).time;
  await second.b.bringToFront();
  await expect.poll(async () => (await saved(a)).time, { timeout: 7000 }).toBeGreaterThan(before + 2000);
  await key(b, 'ArrowLeft'); await expect(b.locator('#position')).toHaveAttribute('data-x', '16');
  await expect(second.b.locator('#position')).toHaveAttribute('data-x', '17');
});

test('host rejects forged actions over the actual guest data channel and disconnects floods', async ({ browser }) => {
  const { a, b } = await pair(browser);
  const moduleUrl = '/castleofthebreakingwinds/node_modules/.vite/deps/peerjs.js';
  await b.evaluate(async moduleUrl => {
    const { util } = await import(moduleUrl);
    const channel = (window as unknown as { testChannels: RTCDataChannel[] }).testChannels.find(c => c.readyState === 'open')!;
    for (const message of [
      { type: 'action', action: { type: 'move', dx: 99999, dy: 0 } },
      { type: 'action', action: { type: 'move', dx: 0.5, dy: 0 } },
      { type: 'action', action: { type: 'give-gold', amount: 99999 } },
      { type: 'state', state: { status: 'won' } },
    ]) channel.send(await util.pack(message));
  }, moduleUrl);
  await key(b, 'ArrowLeft'); await expect(b.locator('#position')).toHaveAttribute('data-x', '16');
  await expect.poll(async () => (await saved(a)).players[1].x).toBe(16);
  expect((await saved(a)).players[1].gold).toBe(20);
  await expect(a.locator('#position')).toHaveAttribute('data-x', '18');
  await b.evaluate(async moduleUrl => {
    const { util } = await import(moduleUrl);
    const channel = (window as unknown as { testChannels: RTCDataChannel[] }).testChannels.find(c => c.readyState === 'open')!;
    const data = await util.pack({ type: 'ping' });
    for (let i = 0; i < 100; i++) channel.send(data);
  }, moduleUrl);
  await expect.poll(() => b.evaluate(() => (window as unknown as { testChannels: RTCDataChannel[] }).testChannels.some(c => c.readyState === 'closed'))).toBeTruthy();
  await expect(a.locator('.player-card')).toHaveCount(2);
});

test('matchmaking reconnect preserves the existing game and starts no duplicate simulation clock', async ({ browser }) => {
  const { a, b } = await pair(browser);
  await a.evaluate(() => {
    const sockets = (window as unknown as { testSockets: WebSocket[] }).testSockets;
    sockets.find(s => s.url.includes('0.peerjs.com') && s.readyState === WebSocket.OPEN)!.close();
  });
  await expect.poll(() => a.evaluate(() => (window as unknown as { testSockets: WebSocket[] }).testSockets.filter(s => s.url.includes('0.peerjs.com')).length), { timeout: 10000 }).toBe(2);
  await expect.poll(() => a.evaluate(() => (window as unknown as { testSockets: WebSocket[] }).testSockets.filter(s => s.url.includes('0.peerjs.com')).at(-1)?.readyState)).toBe(1);
  expect(await a.evaluate(() => (window as unknown as { testWorkers: Worker[] }).testWorkers.length)).toBe(1);
  await key(b, 'ArrowLeft'); await expect(b.locator('#position')).toHaveAttribute('data-x', '16');
  await expect(a.locator('#simulation-status')).toHaveText('REAL TIME');
});
