import { test, expect, type Page } from '@playwright/test';
import { createGame, addPlayer } from '../shared/engine';
import type { GameState } from '../shared/types';
import { arena } from './fixtures';
import { clickTile } from './aim';

const url = 'http://localhost:5173/castleofthebreakingwinds/';
async function key(page: Page, value: string) { await page.locator('#world').focus(); await page.keyboard.press(value); }
async function fixture(page: Page, customize: (g: GameState) => void) {
  await page.goto(url);
  const game = createGame('SOLO01', 42, 'solo'); game.levels[0] = arena(); addPlayer(game, 'solo-test', 'Astrid'); customize(game);
  await page.evaluate(game => {
    sessionStorage.setItem('castle-peer-host-v1', JSON.stringify({ game, token: 'solo-test-token' }));
    sessionStorage.setItem('castle-session', JSON.stringify({ code: game.code, token: 'solo-test-token', playerId: 'solo-test', server: 'peer' }));
  }, game);
  await page.reload(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
}

test('solo starts without matchmaking, moves, restores on refresh, and travels alone', async ({ page }, info) => {
  const matchmaking: string[] = [];
  page.on('websocket', ws => { if (ws.url().includes('peerjs.com')) matchmaking.push(ws.url()); });
  await page.route('**/*peerjs.com/**', route => { matchmaking.push(route.request().url()); return route.abort(); });
  await page.goto(url); await page.locator('#name').fill('Solo adventurer'); await page.locator('#solo').click();
  await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  await expect(page.locator('#connection')).toHaveText('Solo play');
  await expect(page.locator('.player-card')).toHaveCount(1);
  await expect(page.locator('#party-size')).toHaveText('SOLO');
  await expect(page.locator('#share')).toBeHidden(); await expect(page.locator('.waiting-seat')).toHaveCount(0);
  await expect(page.locator('[data-action=revive]')).toBeHidden();
  await key(page, 'ArrowUp'); await expect(page.locator('#position')).toHaveAttribute('data-y', '23');
  const identity = await page.evaluate(() => sessionStorage.getItem('castle-session'));
  await page.reload(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  await expect(page.locator('#position')).toHaveAttribute('data-y', '23');
  expect(await page.evaluate(() => sessionStorage.getItem('castle-session'))).toBe(identity);
  // Refresh retains the last action's cooldown along with the character position.
  await page.waitForTimeout(350);
  for (let i = 0; i < 18; i++) { await key(page, 'ArrowUp'); await page.waitForTimeout(340); }
  await key(page, 'e'); await expect(page.locator('#location')).toHaveText('Abandoned mine \u00b7 1');
  await page.screenshot({ path: info.outputPath('solo-wilderness.png'), fullPage: true });
  expect(matchmaking).toEqual([]);
});

test('solo enemies advance without input and spells award experience', async ({ page }) => {
  await fixture(page, game => {
    game.levels[0].enemies.push({ id: 'rat', name: 'Giant Rat', icon: 387, x: 5, y: 8, hp: 14, maxHp: 14, damage: 1, nextMove: 100 });
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('castle-peer-host-v1')!).game.levels[0].enemies[0].y)).toBeLessThan(8);
  await key(page, '1'); await clickTile(page, 5, 8); await expect(page.locator('#log')).toContainText('Giant Rat falls');
  await page.locator('[data-dialog=inventory]').click(); await expect(page.locator('#dialog-body')).toContainText('XP 12/45');
});

test('solo defeat and restart remain playable without another client', async ({ page }) => {
  await fixture(page, game => {
    game.players[0].hp = 1;
    game.levels[0].enemies.push({ id: 'orc', name: 'Orc', icon: 429, x: 6, y: 5, hp: 100, maxHp: 100, damage: 10, nextMove: 1000 });
  });
  await expect(page.locator('#simulation-status')).toHaveText('EXPEDITION FALLEN');
  await expect(page.locator('#quest-text')).not.toContainText('companion');
  await page.locator('#restart').click(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  await expect(page.locator('#location')).toHaveText('The northern hamlet'); await expect(page.locator('.player-card')).toHaveCount(1);
  await expect(page.locator('.health')).toContainText('60/60'); await expect(page.locator('#ready')).toBeHidden();
  await key(page, 'ArrowRight'); await expect(page.locator('#position')).toHaveAttribute('data-x', '19');
  await page.locator('#leave').click(); await expect(page.locator('#solo')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('castle-peer-host-v1'))).toBeNull();
});
