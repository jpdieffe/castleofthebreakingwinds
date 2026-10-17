import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createGameServer } from '../server/index';
import type { Room } from '../server/index';
import { reveal } from '../server/engine';
import { passable } from '../server/world';
import { arena } from './fixtures';
import { clickTile } from './aim';

let app: ReturnType<typeof createGameServer>, contexts: BrowserContext[], url: string;
test.beforeEach(async () => {
  contexts = []; app = createGameServer({ port: 0, host: '127.0.0.1', dataDir: false }); await once(app.server, 'listening');
  url = `http://localhost:5173/castleofthebreakingwinds/?server=${encodeURIComponent(`ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`)}`;
});
test.afterEach(async () => { await Promise.all(contexts.map(c => c.close())); await app.close(); });
async function client(browser: Browser, name: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); contexts.push(context);
  const page = await context.newPage(); await page.goto(url); await page.locator('#name').fill(name); return page;
}
async function pair(browser: Browser) {
  const a = await client(browser, 'Astrid'), b = await client(browser, 'Bjorn');
  await a.locator('#create').click(); await expect(a.locator('#room-label')).toHaveText(/ROOM [A-Z0-9]{6}/);
  const code = (await a.locator('#room-label').innerText()).split(' ')[1];
  await b.locator('#code').fill(code); await b.locator('#join').click();
  await expect(b.locator('#ready')).toBeVisible();
  await a.locator('#ready').click(); await b.locator('#ready').click();
  await expect(a.locator('#simulation-status')).toHaveText('REAL TIME'); await expect(b.locator('#simulation-status')).toHaveText('REAL TIME');
  return { a, b, room: app.rooms.get(code)!, code };
}
async function fixture(room: Room, pages: Page[]) {
  room.game.level = 0; room.game.levels[0] = arena();
  Object.assign(room.game.players[0], { x: 5, y: 5, nextAction: 0 }); Object.assign(room.game.players[1], { x: 7, y: 5, nextAction: 0 });
  app.broadcast(room); await Promise.all(pages.map(p => expect(p.locator('#location')).toHaveText('Test chamber')));
}
async function key(page: Page, value: string) { await page.locator('#world').focus(); await page.keyboard.press(value); }
async function cooldown(room: Room) { room.game.players.forEach(p => p.nextAction = 0); }

test('two independent clients create, join, ready, walk and see each other on the recovered hamlet', async ({ browser }, info) => {
  const { a, b, room } = await pair(browser);
  expect(room.game.levels[0].source).toContain('CastleWinds_Mobile');
  await expect(a.locator('#party')).toContainText('Bjorn'); await expect(b.locator('#party')).toContainText('Astrid');
  const before = room.game.players[0].x;
  await key(a, 'ArrowRight'); await expect(a.locator('#position')).toHaveAttribute('data-x', String(before + 1));
  await key(b, 'ArrowLeft'); await expect(b.locator('#position')).toHaveAttribute('data-x', '16');
  await expect(a.locator('.player-card')).toHaveCount(2); await expect(b.locator('.player-card')).toHaveCount(2);
  await a.screenshot({ path: info.outputPath('client-a-hamlet.png'), fullPage: true });
  await b.screenshot({ path: info.outputPath('client-b-hamlet.png'), fullPage: true });
});
test('invalid rooms and third players receive visible errors without disrupting the party', async ({ browser }) => {
  const { a, code } = await pair(browser), c = await client(browser, 'Third');
  await c.locator('#code').fill('000000'); await c.locator('#join').click(); await expect(c.locator('#lobby-status')).toContainText('not found');
  await c.locator('#code').fill(code); await c.locator('#join').click(); await expect(c.locator('#lobby-status')).toContainText('two players');
  await expect(a.locator('#simulation-status')).toHaveText('REAL TIME');
});
test('unmodified campaign: both players walk from the hamlet to the mine using real controls', async ({ browser }) => {
  const { a, b, room } = await pair(browser);
  for (let i = 0; i < 19; i++) {
    await Promise.all([key(a, 'ArrowUp'), key(b, 'ArrowUp')]);
    await a.waitForTimeout(330);
  }
  expect(room.game.players[0].y).toBe(5); expect(room.game.players[1].y).toBe(4);
  await key(a, 'e'); await expect(a.locator('#location')).toHaveText('Abandoned mine \u00b7 1'); await expect(b.locator('#location')).toHaveText('Abandoned mine \u00b7 1');
  expect(room.game.level).toBe(1); expect(room.game.players.every(p => p.hp > 0)).toBeTruthy();
});
test('enemies advance without input; attacks and shared experience synchronize', async ({ browser }, info) => {
  const { a, b, room } = await pair(browser); await fixture(room, [a, b]);
  const enemy = { id: 'rat', name: 'Giant Rat', icon: 387, x: 5, y: 8, hp: 18, maxHp: 18, damage: 2, nextMove: room.game.time + 200 };
  room.game.levels[0].enemies.push(enemy); app.broadcast(room);
  await expect.poll(() => enemy.y).toBe(7);
  const firstTime = room.game.time; await a.waitForTimeout(700); expect(enemy.y).toBe(7);
  await expect.poll(() => enemy.y, { timeout: 2500 }).toBe(6); expect(room.game.time - firstTime).toBeGreaterThanOrEqual(1200);
  await key(a, 'Space'); await expect.poll(() => enemy.hp).toBe(9);
  await a.waitForTimeout(350); await key(a, 'Space'); await expect.poll(() => enemy.hp).toBe(0);
  await expect(b.locator('#log')).toContainText('Experience is shared'); expect(room.game.players[1].xp).toBe(12);
  await a.screenshot({ path: info.outputPath('combat-client-a.png'), fullPage: true });
});
test('spells, mana, healing and inventory purchases use the same authoritative state', async ({ browser }) => {
  const { a, b, room } = await pair(browser); await fixture(room, [a, b]);
  const p = room.game.players[0]; const map = room.game.levels[0];
  map.enemies.push({ id: 'orc', name: 'Orc', icon: 429, x: 9, y: 5, hp: 100, maxHp: 100, damage: 1, nextMove: 999999 });
  app.broadcast(room); await key(a, '1'); await clickTile(a, 9, 5); await expect.poll(() => p.mana).toBe(27); expect(map.enemies[0].hp).toBe(86);
  await cooldown(room); p.hp = 10; app.broadcast(room); await key(a, '2'); await expect.poll(() => p.hp).toBe(30);
  await cooldown(room); await key(a, 'h'); await expect.poll(() => p.hp).toBe(60); expect(p.potions).toBe(2);
  await expect(b.locator('.player-card').first()).toContainText('2 potions');
  await cooldown(room); map.shop = { x: p.x, y: p.y }; app.broadcast(room);
  await a.locator('[data-dialog="inventory"]').click(); await a.getByRole('button', { name: 'Healing potion · 10 gold', exact: true }).click();
  await expect.poll(() => p.potions).toBe(3); expect(p.gold).toBe(10); await expect(b.locator('.player-card').first()).toContainText('10 gold');
});
test('simultaneous movement cannot duplicate loot or overlap players; doors synchronize', async ({ browser }) => {
  const { a, b, room } = await pair(browser); await fixture(room, [a, b]);
  const map = room.game.levels[0]; map.loot.push({ id: 'gold', x: 6, y: 5, kind: 'gold', amount: 20 }); app.broadcast(room);
  await Promise.all([key(a, 'ArrowRight'), key(b, 'ArrowLeft')]);
  await expect.poll(() => map.loot.length).toBe(0); expect(room.game.players.reduce((n, p) => n + p.gold, 0)).toBe(60);
  expect(room.game.players[0].x).not.toBe(room.game.players[1].x);
  await cooldown(room); const p = room.game.players[0]; map.tiles[(p.y + 1) * map.width + p.x] = 'door'; app.broadcast(room);
  await key(a, 'ArrowDown'); await expect.poll(() => map.tiles[(p.y + 1) * map.width + p.x]).toBe('open'); expect(p.y).toBe(5);
  await expect(b.locator('#log')).toContainText('opens a door');
});
test('revival, total-party defeat and restart work in both clients', async ({ browser }) => {
  const { a, b, room } = await pair(browser); await fixture(room, [a, b]); const [p, q] = room.game.players;
  q.x = 6; q.hp = 0; app.broadcast(room); await key(b, 'ArrowRight'); expect(q.x).toBe(6);
  await key(a, 'r'); await expect.poll(() => q.hp).toBe(30); expect(p.potions).toBe(2); await expect(b.locator('#log')).toContainText('revives');
  p.hp = 0; q.hp = 0; await expect(a.locator('#simulation-status')).toHaveText('EXPEDITION FALLEN'); await expect(b.locator('#restart')).toBeVisible();
  await a.locator('#restart').click(); await expect(b.locator('#location')).toHaveText('The northern hamlet'); await expect(a.locator('#ready')).toBeVisible(); expect(room.game.players[0].hp).toBe(60);
});
test('refresh and network interruption restore the same adventurer and pause the world', async ({ browser }) => {
  const { a, b, room } = await pair(browser); const id = room.game.players[1].id;
  room.game.players[1].gold = 71; app.broadcast(room); await b.reload(); await expect(b.locator('#simulation-status')).toHaveText('REAL TIME');
  expect(room.game.players[1].id).toBe(id); await expect(b.locator('.player-card.you')).toContainText('71 gold');
  await b.context().setOffline(true); room.sockets.get(id)!.terminate();
  await expect(a.locator('#simulation-status')).toContainText('PAUSED'); const time = room.game.time;
  await a.waitForTimeout(1300); expect(room.game.time).toBe(time);
  await b.context().setOffline(false); await expect(b.locator('#connection')).toHaveText('Connected', { timeout: 10000 });
  await expect(a.locator('#simulation-status')).toHaveText('REAL TIME'); expect(room.game.players.length).toBe(2); expect(room.game.players[1].gold).toBe(71);
});
test('travel requires both partners and all thirteen native areas load in both clients', async ({ browser }, info) => {
  test.setTimeout(60000); const { a, b, room } = await pair(browser);
  const route=[0,1,2,3,2,1,0,4,5,6,7,8,9,10,11,12];
  for (let step=0;step<route.length-1;step++) {
    const area=route[step], destination=route[step+1];
    const map = room.game.levels[area], portal = map.portals.find(p => p.to === destination)!;
    Object.assign(room.game.players[0], { x: portal.x, y: portal.y, nextAction: 0, hp: 60 });
    let partner = { x: portal.x, y: portal.y };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (passable(map, portal.x + dx, portal.y + dy)) { partner = { x: portal.x + dx, y: portal.y + dy }; break; }
    Object.assign(room.game.players[1], { ...partner, hp: 60 });
    reveal(room.game); app.broadcast(room); await key(a, 'e');
    await expect.poll(() => room.game.level).toBe(destination); await expect(b.locator('#location')).toHaveText(room.game.levels[destination].name);
  }
  const map = room.game.levels[12], boss = map.enemies.find(e => e.boss)!;
  map.enemies.filter(e => !e.boss).forEach(e => e.hp = 0);
  const p = room.game.players[0]; boss.x = p.x + 1; boss.y = p.y; boss.hp = 1; map.tiles[boss.y * map.width + boss.x] = 'floor'; p.nextAction = 0; reveal(room.game); app.broadcast(room);
  await key(a, 'Space'); await expect(a.locator('#simulation-status')).toHaveText('VENGEANCE IS YOURS'); await expect(b.locator('#simulation-status')).toHaveText('VENGEANCE IS YOURS');
  await b.screenshot({ path: info.outputPath('victory-client-b.png'), fullPage: true });
});
test('journal, help, touch controls and mobile layout are usable without runtime errors', async ({ browser }, info) => {
  const { a, b } = await pair(browser), errors: string[] = []; a.on('pageerror', error => errors.push(error.message));
  await a.locator('[data-dialog="journal"]').click(); await expect(a.locator('#dialog-body details')).toHaveCount(15); await a.locator('#dialog-body summary').first().click(); await expect(a.locator('.story-text').first()).not.toBeEmpty();
  await a.locator('#close-dialog').click(); await a.locator('[data-dialog="help"]').click(); await expect(a.locator('#dialog-body')).toContainText('Opening a menu does not pause combat'); await a.locator('#close-dialog').click();
  await a.setViewportSize({ width: 390, height: 844 });
  await expect(a.getByRole('button', { name: 'Move east', exact: true })).toBeVisible(); await a.getByRole('button', { name: 'Move east', exact: true }).click();
  await expect(a.locator('#position')).toHaveAttribute('data-x', '19');
  expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await a.screenshot({ path: info.outputPath('mobile.png'), fullPage: true }); expect(errors).toEqual([]);
  await expect(b.locator('#simulation-status')).toHaveText('REAL TIME');
});
test('leaving releases a seat and a new companion can join', async ({ browser }) => {
  const { a, b, code, room } = await pair(browser); await b.locator('#leave').click(); await expect(b.locator('#lobby')).toBeVisible(); await expect(a.locator('#simulation-status')).toHaveText('FORMING PARTY');
  const c = await client(browser, 'New companion'); await c.locator('#code').fill(code); await c.locator('#join').click(); await expect(c.locator('#ready')).toBeVisible(); await c.locator('#ready').click(); await expect(a.locator('#simulation-status')).toHaveText('REAL TIME'); expect(room.game.players).toHaveLength(2);
});
