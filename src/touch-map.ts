/** Touch gestures only. Mouse clicks keep the desktop click handler. */
export function touchMap(canvas: HTMLCanvasElement, tap: (x: number, y: number) => void, inspect: (x: number, y: number) => void, zoom: (factor: number) => void) {
  const points = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | undefined, timer = 0, pinching = false, moved = false, gap = 0;
  const separation = () => { const [a, b] = [...points.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  function cancel() { clearTimeout(timer); points.clear(); start = undefined; pinching = false; moved = false; }
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.size > 1) { clearTimeout(timer); pinching = true; gap = separation(); return; }
    start = { x: event.clientX, y: event.clientY }; moved = false;
    timer = window.setTimeout(() => { if (start && !pinching && !moved) { inspect(start.x, start.y); moved = true; } }, 550);
  });
  canvas.addEventListener('pointermove', event => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinching && points.size > 1) { const next = separation(); if (gap > 0 && next > 0) zoom(next / gap); gap = next; }
    else if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) { moved = true; clearTimeout(timer); }
  });
  canvas.addEventListener('pointerup', event => {
    if (!points.has(event.pointerId)) return;
    canvas.dataset.lastTouch = String(performance.now());
    clearTimeout(timer);
    if (points.size === 1 && !pinching && !moved) tap(event.clientX, event.clientY);
    points.delete(event.pointerId); if (!points.size) cancel();
  });
  canvas.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', cancel);
  return cancel;
}
