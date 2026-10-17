import { test, expect, type Page } from '@playwright/test';

const url = 'http://localhost:5173/castleofthebreakingwinds/';
async function fits(page: Page) {
  const bounds = await page.evaluate(() => {
    const rect = (selector: string) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const mobile = document.body.classList.contains('mobile-ui'), c = document.querySelector<HTMLCanvasElement>('#world')!;
    return { mobile, ratio: c.width / c.height, map: rect('#world'), bar: rect(mobile ? '.mobile-heading' : '.toolbar'), width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight };
  });
  expect(bounds.bar.y).toBeGreaterThanOrEqual(0);
  expect(bounds.bar.bottom).toBeLessThanOrEqual(bounds.map.y);
  expect(bounds.map.bottom).toBeLessThanOrEqual(bounds.height);
  expect(bounds.map.x).toBeGreaterThanOrEqual(0);
  expect(bounds.map.right).toBeLessThanOrEqual(bounds.width);
  expect(bounds.map.height).toBeGreaterThan(100);
  expect(bounds.map.width / bounds.map.height).toBeCloseTo(bounds.ratio, 2);
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
  expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.height + 1);
  if (bounds.mobile) { await expect(page.locator('#touch-arrow')).toBeInViewport({ ratio: 1 }); await expect(page.getByRole('button', { name: 'Spells', exact: true })).toBeInViewport({ ratio: 1 }); return; }
  for (const spell of ['bolt', 'heal', 'fireball']) await expect(page.locator(`[data-action=${spell}]`)).toBeInViewport({ ratio: 1 });
}

test('map and spells stay fully visible through laptop, small-window, phone and landscape resizes', async ({ page }, info) => {
  await page.goto(url); await page.locator('#name').fill('Layout check'); await page.locator('#solo').click();
  await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  for (const [width, height] of [[1366, 768], [1280, 600], [880, 700], [1920, 1080], [390, 844], [360, 640], [844, 390]]) {
    await page.setViewportSize({ width, height }); await fits(page);
    // Click the neighboring tile after scaling; letterboxing must not offset movement.
    const target = await page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('#world')!, r = c.getBoundingClientRect();
      return { x: r.x + (14 - Number(c.dataset.viewX) + 0.5) * r.width / Number(c.dataset.columns), y: r.y + (16 - Number(c.dataset.viewY) + 0.5) * r.height / Number(c.dataset.rows) };
    });
    await page.mouse.click(target.x, target.y); await expect(page.locator('#position')).toHaveAttribute('data-x', '14');
    await page.waitForTimeout(350); await page.locator('#world').focus(); await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#position')).toHaveAttribute('data-x', '13'); await page.waitForTimeout(350);
    if (width === 1366 || width === 390) await page.screenshot({ path: info.outputPath(`fit-${width}.png`) });
  }
  await page.getByRole('button', { name: 'Pack', exact: true }).click(); await expect(page.locator('#dialog')).toBeVisible();
  await page.locator('#close-dialog').click(); await fits(page);
  await page.getByRole('button', { name: 'Game menu', exact: true }).click(); await page.getByRole('button', { name: 'Leave expedition', exact: true }).click(); await expect(page.locator('#solo')).toBeVisible();
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
      if (width <= 1000) { await expect(a.locator('#mobile-vitals')).toBeInViewport({ ratio: 1 }); await expect(a.locator('#mobile-partner')).toContainText('Bjorn'); }
      else { await expect(a.locator('.player-card .health').first()).toBeInViewport({ ratio: 1 }); await expect(a.locator('.player-card .health').nth(1)).toBeInViewport({ ratio: 1 }); }
      if (width === 390) await a.screenshot({ path: info.outputPath('coop-phone.png') });
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await a.getByRole('button', { name: 'Move east', exact: true }).click();
    await expect(a.locator('#position')).toHaveAttribute('data-x', '14');
    await expect(b.locator('#simulation-status')).toHaveText('REAL TIME');
  } finally { await a.close(); await b.close(); }
});
