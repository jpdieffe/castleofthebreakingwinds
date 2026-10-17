import type { Page } from '@playwright/test';

// Fixture arenas are 24 x 18; use the displayed player position to account for camera offset.
export async function clickTile(page: Page, x: number, y: number, width = 24, height = 18) {
  const point = await page.evaluate(({ x, y, width, height }) => {
    const position = document.querySelector<HTMLElement>('#position')!;
    const viewX = Math.max(0, Math.min(width - 23, Number(position.dataset.x) - 11));
    const viewY = Math.max(0, Math.min(height - 17, Number(position.dataset.y) - 8));
    const rect = document.querySelector('#world')!.getBoundingClientRect();
    return { x: rect.x + (x - viewX + 0.5) * rect.width / 23, y: rect.y + (y - viewY + 0.5) * rect.height / 17 };
  }, { x, y, width, height });
  await page.mouse.click(point.x, point.y);
}
