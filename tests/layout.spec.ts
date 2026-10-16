import { test, expect, type Page } from '@playwright/test';

const url = 'http://localhost:5173/castleofthebreakingwinds/';
async function fits(page: Page) {
  const bounds = await page.evaluate(() => {
    const rect = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return { map: rect('#world'), bar: rect('.toolbar'), width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight };
  });
  expect(bounds.bar.y).toBeGreaterThanOrEqual(0);
  expect(bounds.bar.bottom).toBeLessThanOrEqual(bounds.map.y);
  expect(bounds.map.bottom).toBeLessThanOrEqual(bounds.height);
  expect(bounds.map.x).toBeGreaterThanOrEqual(0);
  expect(bounds.map.right).toBeLessThanOrEqual(bounds.width);
  expect(bounds.map.height).toBeGreaterThan(100);
  expect(bounds.map.width / bounds.map.height).toBeCloseTo(23 / 17, 2);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
  expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.height + 1);
  for (const spell of ['bolt', 'heal', 'fireball']) await expect(page.locator(`[data-action=${spell}]`)).toBeInViewport({ ratio: 1 });
}

test('map and spells stay fully visible through laptop, small-window, phone and landscape resizes', async ({ page }, info) => {
  await page.goto(url); await page.locator('#name').fill('Layout check'); await page.locator('#solo').click();
  await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  for (const [width, height] of [[1366, 768], [1280, 600], [880, 700], [1920, 1080], [390, 844], [360, 640], [844, 390]]) {
    await page.setViewportSize({ width, height }); await fits(page);
    // Click the neighboring tile after scaling; letterboxing must not offset movement.
    const target = await page.evaluate(() => {
      const game = JSON.parse(sessionStorage.getItem('castle-peer-host-v1')!).game;
      const position = document.querySelector<HTMLElement>('#position')!;
      const p = { x: Number(position.dataset.x), y: Number(position.dataset.y) }, map = game.levels[game.level], r = document.querySelector('#world')!.getBoundingClientRect();
      const viewX = Math.max(0, Math.min(map.width - 23, p.x - 11)), viewY = Math.max(0, Math.min(map.height - 17, p.y - 8));
      return { x: r.x + (14 - viewX + 0.5) * r.width / 23, y: r.y + (16 - viewY + 0.5) * r.height / 17 };
    });
    await page.mouse.click(target.x, target.y); await expect(page.locator('#position')).toHaveAttribute('data-x', '14');
    await page.waitForTimeout(350); await page.locator('#world').focus(); await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#position')).toHaveAttribute('data-x', '13'); await page.waitForTimeout(350);
    if (width === 1366 || width === 390) await page.screenshot({ path: info.outputPath(`fit-${width}.png`) });
  }
  await page.locator('[data-dialog=inventory]').click(); await expect(page.locator('#dialog')).toBeVisible();
  await page.locator('#close-dialog').click(); await fits(page);
  await page.locator('#leave').click(); await expect(page.locator('#solo')).toBeVisible();
});

test('two-player spells, map and health remain visible in small windows', async ({ browser }, info) => {
  const a = await browser.newPage(), b = await browser.newPage();
  try {
    await a.goto(url); await a.locator('#name').fill('Astrid'); await a.locator('#create').click();
    await expect(a.locator('#ready')).toBeVisible({ timeout: 25000 });
    const code = (await a.locator('#room-label').innerText()).split(' ')[1];
    await b.goto(url); await b.locator('#name').fill('Bjorn'); await b.locator('#code').fill(code); await b.locator('#join').click();
    await expect(b.locator('#ready')).toBeVisible({ timeout: 25000 });
    await a.locator('#ready').click(); await b.locator('#ready').click();
    await expect(a.locator('#simulation-status')).toHaveText('REAL TIME');
    for (const [width, height] of [[1280, 600], [880, 700], [390, 844], [360, 640], [844, 390]]) {
      await a.setViewportSize({ width, height }); await fits(a);
      await expect(a.locator('.player-card .health').first()).toBeInViewport({ ratio: 1 });
      await expect(a.locator('.player-card .health').nth(1)).toBeInViewport({ ratio: 1 });
      if (width === 390) await a.screenshot({ path: info.outputPath('coop-phone.png') });
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await a.getByRole('button', { name: 'Move east', exact: true }).click();
    await expect(a.locator('#position')).toHaveAttribute('data-x', '14');
    await expect(b.locator('#simulation-status')).toHaveText('REAL TIME');
  } finally { await a.close(); await b.close(); }
});
