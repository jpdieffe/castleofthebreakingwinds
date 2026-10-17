import type { Page } from '@playwright/test';

// Read the rendered camera so targeting also works after rotation and pinch zoom.
export async function clickTile(page: Page, x: number, y: number) {
  const point = await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#world')!, rect = canvas.getBoundingClientRect();
    return { x: rect.x + (x - Number(canvas.dataset.viewX) + 0.5) * rect.width / Number(canvas.dataset.columns), y: rect.y + (y - Number(canvas.dataset.viewY) + 0.5) * rect.height / Number(canvas.dataset.rows) };
  }, { x, y });
  await page.mouse.click(point.x, point.y);
}
