import { test, expect, type Page } from '@playwright/test';
import { createGame, addPlayer } from '../shared/engine';
import { arena } from './fixtures';

const url = 'http://localhost:5173/castleofthebreakingwinds/';
async function fixture(page: Page) {
  await page.goto(url);
  const game = createGame('GEAR01', 42, 'solo'); game.levels[0] = arena(); game.levels[0].shop = { x: 5, y: 5 };
  const p = addPlayer(game, 'gear-host', '<b>Astrid</b>'); Object.assign(p, { hp: 10, mana: 5, gold: 100 });
  await page.evaluate(game => {
    sessionStorage.setItem('castle-peer-host-v1', JSON.stringify({ game, token: 'gear-token' }));
    sessionStorage.setItem('castle-session', JSON.stringify({ code: game.code, token: 'gear-token', playerId: 'gear-host', server: 'peer' }));
  }, game);
  await page.reload(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  await page.locator('[data-dialog=inventory]').click();
}

test('classic inventory shows real equipment and updates purchases and potion use without reopening', async ({ page }, info) => {
  await fixture(page);
  await expect(page.locator('[data-character]')).toHaveText('<b>Astrid</b>');
  await expect(page.locator('[data-character] b')).toHaveCount(0);
  await expect(page.locator('.equipment-slot')).toHaveCount(15);
  await expect(page.locator('[data-slot=armor]')).toContainText('None');
  await expect(page.locator('[data-slot=neck]')).toHaveAttribute('aria-label', 'Neckwear: empty');
  expect(await page.locator('.inventory-figure').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBeTruthy();
  await page.locator('[data-open-shop]').click();
  await page.locator('[data-shop-item=weapon]').click(); await page.locator('[data-shop-commit]').click();
  await expect(page.locator('[data-shop-balance]')).toContainText('65 gold');
  await expect(page.locator('[data-shop-commit]')).toBeDisabled();
  await page.waitForTimeout(350); await page.locator('[data-shop-item=armor]').click(); await page.locator('[data-shop-commit]').click();
  await expect(page.locator('[data-shop-balance]')).toContainText('35 gold');
  await page.waitForTimeout(350); await page.locator('[data-shop-item=potion]').click(); await page.locator('[data-shop-commit]').click();
  await expect(page.locator('[data-shop-balance]')).toContainText('25 gold');
  await page.locator('#close-dialog').click(); await page.keyboard.press('i');
  await expect(page.locator('[data-slot=weapon]')).toContainText('+2');
  await expect(page.locator('[data-slot=armor]')).toContainText('+1');
  await expect(page.locator('[data-slot=armor] img')).toBeVisible();
  await expect(page.locator('[data-potion=potion]')).toContainText('Quantity: 4');
  await page.waitForTimeout(350); await page.getByRole('button', { name: 'Drink healing potion', exact: true }).click();
  await expect(page.locator('[data-potion=potion]')).toContainText('Quantity: 3');
  await expect(page.locator('[data-vitals]')).toContainText('HP 45/60');
  await page.waitForTimeout(350); await page.getByRole('button', { name: 'Drink mana potion', exact: true }).click();
  await expect(page.locator('[data-potion=mana]')).toContainText('Quantity: 1');
  await expect(page.locator('[data-slot=pack]')).toContainText('4 potions');
  await expect(page.locator('#dialog')).toBeVisible();
  await page.screenshot({ path: info.outputPath('inventory-desktop.png') });
  await page.getByRole('button', { name: 'Exit!', exact: true }).click();
  await expect(page.locator('#world')).toBeFocused();
  await page.keyboard.press('i'); await expect(page.locator('[data-slot=purse]')).toContainText('25 gold');
  await page.keyboard.press('Escape'); await page.locator('[data-dialog=help]').click();
  await expect(page.locator('#dialog')).not.toHaveClass(/inventory-dialog/);
});

test('inventory fits small windows, scrolls on phones, and shows Floor away from the shop', async ({ page }, info) => {
  await page.goto(url); await page.locator('#name').fill('Astrid'); await page.locator('#solo').click();
  await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(350); }
  await page.keyboard.press('i'); await expect(page.locator('[data-floor-title]')).toHaveText('Floor');
  await expect(page.locator('[data-floor]')).toContainText('Floor is empty');
  await expect(page.locator('[data-open-shop]')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Drink healing potion' })).toBeDisabled();
  for (const [width, height] of [[1280, 600], [390, 844], [360, 640], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.locator('#dialog').evaluate(el => {
      const r = el.getBoundingClientRect(), body = document.querySelector('#dialog-body')!;
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, contentWidth: body.scrollWidth, width: body.clientWidth };
    });
    expect(bounds.top).toBeGreaterThanOrEqual(0); expect(bounds.bottom).toBeLessThanOrEqual(height);
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(width);
    expect(bounds.contentWidth).toBeLessThanOrEqual(bounds.width);
    await page.locator('[data-potion=mana]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-potion=mana]')).toBeInViewport();
    await expect(page.locator('#close-dialog')).toBeInViewport({ ratio: 1 });
    if (width === 390) await page.screenshot({ path: info.outputPath('inventory-phone.png') });
  }
  await page.locator('#close-dialog').click(); await expect(page.locator('#world')).toBeFocused();
  await page.keyboard.press('i'); await expect(page.locator('#dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#dialog')).not.toBeVisible();
});
