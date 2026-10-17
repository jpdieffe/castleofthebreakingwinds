import { test, expect, type Page } from '@playwright/test';
import { addPlayer, createGame } from '../shared/engine';

async function press(page: Page, selector: string) {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.locator(selector).tap();
  else await page.locator(selector).click();
}

async function shop(page: Page, level = 0, entrance = 0, gold = 100) {
  await page.goto('http://localhost:5173/castleofthebreakingwinds/');
  const game = createGame('SHOP01', 42, 'solo'); game.level = level;
  const p = addPlayer(game, 'shop-host', 'Astrid'), door = game.levels[level].shops![entrance];
  Object.assign(p, door, { gold, potions: 1, manaPotions: 0 });
  await page.evaluate(game => {
    sessionStorage.setItem('castle-peer-host-v1', JSON.stringify({ game, token: 'shop-token' }));
    sessionStorage.setItem('castle-session', JSON.stringify({ code: game.code, token: 'shop-token', playerId: 'shop-host', server: 'peer' }));
  }, game);
  await page.reload(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  if (await page.locator('#touch-interact').isVisible()) await press(page, '#touch-interact');
  else await page.keyboard.press('e');
}

test('native shop selects before buying, sells only owned potions, and saves transactions', async ({ page }) => {
  await shop(page);
  await expect(page.locator('#dialog-title')).toHaveText('Trading post');
  await expect(page.locator('[data-shop-commit]')).toBeDisabled();
  await press(page, '[data-shop-item=potion]');
  await expect(page.locator('[data-shop-balance]')).toHaveText('100 gold · Pack 1 potions');
  await press(page, '[data-shop-commit]');
  await expect(page.locator('[data-shop-balance]')).toHaveText('90 gold · Pack 2 potions');
  await press(page, '[data-shop-tab=sell]');
  await expect(page.locator('[data-shop-item=mana]')).toHaveCount(0);
  await press(page, '[data-shop-item=weapon]');
  await expect(page.locator('[data-shop-commit]')).toBeDisabled();
  await expect(page.locator('[data-shop-notice]')).toContainText('Equipped');
  await press(page, '[data-shop-item=potion]');
  for (const gold of [93, 96]) {
    await page.waitForTimeout(350); await press(page, '[data-shop-commit]');
    await expect(page.locator('[data-shop-balance]')).toContainText(`${gold} gold`);
  }
  await expect(page.locator('[data-shop-item=potion]')).toHaveCount(0);
  await expect(page.locator('[data-shop-commit]')).toBeDisabled();
  await expect(page.locator('[data-shop-notice]')).toContainText('None remaining');
  await press(page, '#close-dialog'); await page.reload();
  await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  if (await page.locator('#touch-interact').isVisible()) await press(page, '#touch-interact');
  else await page.keyboard.press('e');
  await expect(page.locator('[data-shop-balance]')).toContainText('96 gold');
});

test('shop details, buy and close fit small portrait and landscape screens', async ({ page }, info) => {
  await shop(page, 4, 0, 0);
  await expect(page.locator('#dialog-title')).toHaveText(/Sverting/);
  await press(page, '[data-shop-item=weapon]');
  await expect(page.locator('[data-shop-notice]')).toContainText('Not enough gold');
  await expect(page.locator('[data-shop-commit]')).toBeDisabled();
  for (const [width, height] of [[320,568], [390,844], [667,375], [844,390], [1280,720]]) {
    await page.setViewportSize({ width, height });
    for (const selector of ['#close-dialog', '[data-shop-tab=buy]', '[data-shop-tab=sell]', '[data-shop-commit]', '[data-shop-title]']) {
      await expect(page.locator(selector)).toBeInViewport({ ratio: 1 });
    }
    const bounds = await page.locator('#dialog').evaluate(el => {
      const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, overflow:el.scrollWidth > el.clientWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(width);
    expect(bounds.top).toBeGreaterThanOrEqual(0); expect(bounds.bottom).toBeLessThanOrEqual(height); expect(bounds.overflow).toBe(false);
    await page.locator('[data-shop-item=armor]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-shop-item=armor]')).toBeInViewport({ ratio:1 });
    const images = await page.locator('.shop-grid img').evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
    expect(images).toBe(true);
    if (width === 390 || width === 844) await page.screenshot({ path:info.outputPath(`shop-${width}.png`) });
  }
  await press(page, '#close-dialog'); await expect(page.locator('#world')).toBeFocused();
  await page.keyboard.press('e'); await expect(page.locator('#dialog')).toHaveClass(/shop-dialog/);
});
