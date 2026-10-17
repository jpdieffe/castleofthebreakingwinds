import { test, expect, type Page } from '@playwright/test';
import { createGame, addPlayer } from '../shared/engine';
import { arena } from './fixtures';
import { clickTile } from './aim';

const url = 'http://localhost:5173/castleofthebreakingwinds/';
async function fixture(page: Page, mode: 'solo' | 'coop') {
  await page.goto(url);
  const game = createGame(crypto.randomUUID().slice(0, 6).toUpperCase(), 42, mode);
  game.levels[0] = arena(); addPlayer(game, 'aim-host', 'Astrid');
  await page.evaluate(game => {
    sessionStorage.setItem('castle-peer-host-v1', JSON.stringify({ game, token: 'aim-token' }));
    sessionStorage.setItem('castle-session', JSON.stringify({ code: game.code, token: 'aim-token', playerId: 'aim-host', server: 'peer' }));
  }, game);
  await page.reload();
  return game.code;
}
async function visibleArrow(page: Page, row: number) {
  return page.evaluate(row => new Promise<boolean>(resolve => {
    const ctx = document.querySelector<HTMLCanvasElement>('#world')!.getContext('2d')!, until = performance.now() + 800;
    function inspect() {
      // Inspect empty floor beyond the player for the cyan projectile, not UI metadata.
      const pixels = ctx.getImageData(6 * 32, row * 32 + 10, 4 * 32, 12).data;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 180 && pixels[i + 1] > 200 && pixels[i + 2] > 230) { resolve(true); return; }
      if (performance.now() >= until) resolve(false); else requestAnimationFrame(inspect);
    }
    inspect();
  }), row);
}

test('Magic Arrow selects a crosshair; empty-floor clicks fire visibly without walking; Escape and right-click cancel', async ({ page }, info) => {
  await fixture(page, 'solo'); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  const button = page.locator('[data-action=bolt]');
  await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#world')).toHaveCSS('cursor', 'crosshair');
  await expect(page.locator('.mana')).toContainText('30/30');
  await expect(page.locator('#position')).toContainText('click to fire');
  await clickTile(page, 9, 5); expect(await visibleArrow(page, 5)).toBeTruthy();
  await expect(page.locator('.mana')).toContainText('27/30');
  await expect(page.locator('#position')).toHaveAttribute('data-x', '5');
  await page.screenshot({ path: info.outputPath('aiming-solo.png') });
  await page.waitForTimeout(400); await expect(page.locator('#position')).toHaveAttribute('data-x', '5');
  await clickTile(page, 9, 5); await expect(page.locator('.mana')).toContainText('24/30');
  await page.keyboard.press('Escape'); await expect(button).toHaveAttribute('aria-pressed', 'false');
  await clickTile(page, 6, 5); await expect(page.locator('#position')).toHaveAttribute('data-x', '6');
  await page.keyboard.press('1'); await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#world').click({ button: 'right' }); await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click(); await page.locator('[data-action=heal]').click(); await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('aiming stops queued walking and insufficient mana does not turn a shot into movement', async ({ page }) => {
  await fixture(page, 'solo'); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  await clickTile(page, 10, 5); await page.locator('[data-action=bolt]').click();
  const x = await page.locator('#position').getAttribute('data-x');
  await page.waitForTimeout(700); await expect(page.locator('#position')).toHaveAttribute('data-x', x!);
  await page.locator('#leave').click();
  const raw = createGame('LOWMP1', 42, 'solo'); raw.levels[0] = arena(); addPlayer(raw, 'aim-host', 'Astrid').mana = 2;
  await page.evaluate(game => {
    sessionStorage.setItem('castle-peer-host-v1', JSON.stringify({ game, token: 'aim-token' }));
    sessionStorage.setItem('castle-session', JSON.stringify({ code: game.code, token: 'aim-token', playerId: 'aim-host', server: 'peer' }));
  }, raw);
  await page.reload(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  await page.locator('[data-action=bolt]').click(); await clickTile(page, 9, 5);
  await expect(page.locator('#toast')).toContainText('3 mana'); await expect(page.locator('.mana')).toContainText('2/30');
  await page.waitForTimeout(400); await expect(page.locator('#position')).toHaveAttribute('data-x', '5');
});

test('guest aimed shots are authoritative and the projectile is visible in both clients', async ({ browser }, info) => {
  const a = await browser.newPage(), b = await browser.newPage();
  try {
    const code = await fixture(a, 'coop'); await expect(a.locator('#ready')).toBeVisible({ timeout: 25000 });
    await b.goto(url); await b.locator('#name').fill('Bjorn'); await b.locator('#code').fill(code); await b.locator('#join').click();
    await expect(b.locator('#ready')).toBeVisible({ timeout: 25000 }); await a.locator('#ready').click(); await b.locator('#ready').click();
    await expect(b.locator('#simulation-status')).toHaveText('REAL TIME');
    await b.locator('[data-action=bolt]').click(); await clickTile(b, 9, 4);
    expect(await Promise.all([visibleArrow(a, 4), visibleArrow(b, 4)])).toEqual([true, true]);
    await expect(a.locator('.player-card').nth(1).locator('.mana')).toContainText('27/30');
    await expect(b.locator('#position')).toHaveAttribute('data-x', '4');
    await expect(a.locator('#log')).toContainText('Bjorn fires a Magic Arrow toward 9, 4');
    await b.screenshot({ path: info.outputPath('aiming-guest.png') });
  } finally { await a.close(); await b.close(); }
});
