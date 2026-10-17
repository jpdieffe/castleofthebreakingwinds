import { test, expect, type Page } from '@playwright/test';
import { createGame, addPlayer } from '../shared/engine';
import { arena } from './fixtures';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createGameServer } from '../server/index';
const url = 'http://localhost:5173/castleofthebreakingwinds/';
async function start(page: Page) { await page.goto(url); await page.locator('#name').fill('Astrid'); await page.locator('#solo').tap(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME'); }
async function tile(page: Page, x: number, y: number) {
  return page.locator('#world').evaluate((canvas: HTMLCanvasElement, { x, y }) => {
    const r = canvas.getBoundingClientRect();
    return { x: r.x + (x - Number(canvas.dataset.viewX) + .5) * r.width / Number(canvas.dataset.columns), y: r.y + (y - Number(canvas.dataset.viewY) + .5) * r.height / Number(canvas.dataset.rows) };
  }, { x, y });
}
async function tapTile(page: Page, x: number, y: number) { const p = await tile(page, x, y); await page.touchscreen.tap(p.x, p.y); }
async function fits(page: Page) {
  const b = await page.locator('#world').evaluate((c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,cols:Number(c.dataset.columns),rows:Number(c.dataset.rows),vw:innerWidth,vh:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight };
  });
  expect(b.sw).toBeLessThanOrEqual(b.vw); expect(b.sh).toBeLessThanOrEqual(b.vh + 1);
  expect(b.x).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(b.vw); expect(b.bottom).toBeLessThanOrEqual(b.vh);
  expect(b.height).toBeGreaterThan(120); expect(b.width / b.cols).toBeCloseTo(b.height / b.rows, 1);
  for (const s of ['#touch-arrow', '#touch-interact', '.mobile-tabs', '.dpad', '#mobile-vitals', '#mobile-partner']) await expect(page.locator(s)).toBeInViewport({ ratio: 1 });
  const sizes = await page.locator('.dpad button, .touch-actions button, .mobile-tabs button, .map-tools button:visible').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }));
  for (const [w,h] of sizes) { expect(w).toBeGreaterThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(44); }
}

test('portrait and landscape keep map, eight-way controls and actions visible; zoomed taps aim without walking', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await start(page);
  for (const [width,height] of [[390,844],[360,640],[320,568],[844,390],[667,375]]) { await page.setViewportSize({width,height}); await page.waitForTimeout(100); await fits(page); }
  await page.setViewportSize({width:390,height:844});
  const before = Number(await page.locator('#world').getAttribute('data-columns')); await page.locator('#zoom-in').tap();
  await expect.poll(async () => Number(await page.locator('#world').getAttribute('data-columns'))).toBeLessThan(before);
  await page.locator('#touch-arrow').tap(); await tapTile(page,19,24);
  await expect(page.locator('#mobile-vitals')).toContainText('27/30'); await expect(page.locator('#position')).toHaveAttribute('data-x','18');
  await page.screenshot({path:info.outputPath('phone-aim.png')});
  await page.locator('#cancel-aim').tap(); await page.waitForTimeout(350); await tapTile(page,19,24);
  await expect(page.locator('#position')).toHaveAttribute('data-x','19');
  await page.waitForTimeout(350); await page.getByRole('button',{name:'Move northwest',exact:true}).tap();
  await expect(page.locator('#position')).toHaveAttribute('data-x','18'); await expect(page.locator('#position')).toHaveAttribute('data-y','23');
  await page.setViewportSize({width:844,height:390}); await fits(page); await page.screenshot({path:info.outputPath('phone-landscape.png')});
  await page.reload(); await expect(page.locator('#position')).toHaveAttribute('data-y','23'); expect(errors).toEqual([]);
});

test('touch spellbook, inventory selection and purchases, hero, journal and menu work without keyboard', async ({ page }, info) => {
  await page.goto(url); const game=createGame('PHONE1',42,'solo'); game.levels[0]=arena(); game.levels[0].shop={x:5,y:5};
  const p=addPlayer(game,'phone-host','Astrid'); Object.assign(p,{hp:10,mana:5,gold:100});
  await page.evaluate(game => { sessionStorage.setItem('castle-peer-host-v1',JSON.stringify({game,token:'phone-token'})); sessionStorage.setItem('castle-session',JSON.stringify({code:game.code,token:'phone-token',playerId:'phone-host',server:'peer'})); },game);
  await page.reload(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  await page.locator('#touch-interact').tap(); await page.locator('[data-shop-item=weapon]').tap();
  await expect(page.locator('[data-shop-balance]')).toContainText('100 gold');
  await page.locator('[data-shop-commit]').tap(); await expect(page.locator('[data-shop-balance]')).toContainText('65 gold');
  await page.locator('#close-dialog').tap(); await page.getByRole('button',{name:'Pack',exact:true}).tap();
  await expect(page.locator('[data-slot=weapon]')).toContainText('+2');
  await page.locator('[data-potion=potion]').tap(); await page.waitForTimeout(350); await page.locator('[data-selected-action]').tap();
  await expect(page.locator('[data-vitals]')).toContainText('45/60'); await expect(page.locator('[data-potion=potion]')).toContainText('Quantity: 2');
  await page.setViewportSize({width:844,height:390}); await expect(page.locator('[data-selected-action]')).toBeInViewport({ratio:1});
  await expect(page.locator('#close-dialog')).toBeInViewport({ratio:1}); await page.screenshot({path:info.outputPath('phone-inventory.png')});
  await page.locator('#close-dialog').tap(); await page.getByRole('button',{name:'Spells',exact:true}).tap();
  await page.locator('[data-spell=fireball]').tap(); await expect(page.locator('#cast-spell')).toBeDisabled();
  await page.locator('[data-spell=bolt]').tap(); await expect(page.locator('#cast-spell')).toBeEnabled(); await page.screenshot({path:info.outputPath('phone-spells.png')});
  await page.locator('#cast-spell').tap(); await expect(page.locator('#dialog')).not.toBeVisible(); await expect(page.locator('#touch-arrow')).toHaveAttribute('aria-pressed','true');
  await page.locator('#cancel-aim').tap(); await page.getByRole('button',{name:'Hero',exact:true}).tap(); await expect(page.locator('#dialog-body')).toContainText('Short sword +2'); await page.locator('#close-dialog').tap();
  await page.getByRole('button',{name:'Journal',exact:true}).tap(); await expect(page.locator('#dialog-body details')).toHaveCount(15); await page.locator('#close-dialog').tap();
  await page.getByRole('button',{name:'Game menu',exact:true}).tap(); await page.getByRole('button',{name:'Leave expedition',exact:true}).tap(); await expect(page.locator('#solo')).toBeVisible();
});

test('held movement stops on release and opening a menu cancels it', async ({ page }) => {
  await start(page); const north=await page.getByRole('button',{name:'Move north',exact:true}).boundingBox();
  await page.mouse.move(north!.x+north!.width/2,north!.y+north!.height/2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
  const y=Number(await page.locator('#position').getAttribute('data-y')); expect(y).toBeLessThan(23);
  await page.waitForTimeout(700); await expect(page.locator('#position')).toHaveAttribute('data-y',String(y));
  await page.getByRole('button',{name:'Pack',exact:true}).tap(); await page.waitForTimeout(400); await expect(page.locator('#position')).toHaveAttribute('data-y',String(y));
});

test('two touch clients host/join, synchronize movement and arrows, purchase independently and reconnect', async ({ page: a, browser }, info) => {
  await a.goto(url);
  test.skip(!await a.evaluate(() => typeof RTCPeerConnection !== 'undefined'), 'This Windows WebKit build has no WebRTC API. Co-op is tested over real WebRTC in Chrome and separately over WebSocket in WebKit.');
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}), b=await ctx.newPage();
  try {
    await a.goto(url); await a.locator('#name').fill('Astrid'); await a.locator('#create').tap(); await expect(a.locator('#ready')).toBeVisible({timeout:25000});
    const code=(await a.locator('#room-label').innerText()).split(' ')[1];
    await b.goto(url); await b.locator('#name').fill('Bjorn'); await b.locator('#code').fill(code); await b.locator('#join').tap(); await expect(b.locator('#ready')).toBeVisible({timeout:25000});
    await a.locator('#ready').tap(); await b.locator('#ready').tap(); await expect(b.locator('#simulation-status')).toHaveText('REAL TIME');
    await fits(a); await fits(b); await expect(a.locator('#mobile-partner')).toContainText('Bjorn');
    await b.getByRole('button',{name:'Move east',exact:true}).tap(); await expect(b.locator('#position')).toHaveAttribute('data-x','18');
    await b.waitForTimeout(350); await b.locator('#touch-arrow').tap(); await tapTile(b,19,23);
    await expect(b.locator('#mobile-vitals')).toContainText('27/30'); await expect(a.locator('#mobile-log')).toContainText('Bjorn fires a Magic Arrow');
    await b.locator('#cancel-aim').tap();
    for(let i=0;i<9;i++){await b.waitForTimeout(300);await b.getByRole('button',{name:'Move north',exact:true}).tap();}
    for(let i=0;i<8;i++){await b.waitForTimeout(300);await b.getByRole('button',{name:'Move west',exact:true}).tap();}
    await b.locator('#touch-interact').tap(); await b.locator('[data-shop-item=potion]').tap(); await b.waitForTimeout(350); await b.locator('[data-shop-commit]').tap();
    await expect(b.locator('[data-shop-balance]')).toContainText('10 gold'); await expect(a.locator('.player-card').nth(1)).toContainText('4 potions');
    await b.locator('#close-dialog').tap(); await b.reload(); await expect(b.locator('#simulation-status')).toHaveText('REAL TIME',{timeout:25000});
    await expect(b.locator('#mobile-vitals')).toContainText('10 gold');
    await b.getByRole('button',{name:'Spells',exact:true}).tap(); await b.locator('[data-spell=fireball]').tap(); await b.locator('[data-assign-slot="0"]').tap(); await b.locator('#close-dialog').tap();
    await expect(b.locator('[data-quick-slot="0"]')).toHaveAttribute('data-assigned','fireball'); await expect(a.locator('[data-quick-slot="0"]')).toHaveAttribute('data-assigned','bolt');
    await b.reload(); await expect(b.locator('#simulation-status')).toHaveText('REAL TIME',{timeout:25000}); await expect(b.locator('[data-quick-slot="0"]')).toHaveAttribute('data-assigned','fireball');
    await a.screenshot({path:info.outputPath('phone-coop.png')});
  } finally {await ctx.close();}
});

test('unsupported WebRTC reports the limitation immediately and solo remains playable', async ({ page }) => {
  await page.goto(url);
  // Disable after PeerJS's vendor-prefix shims have initialized.
  await page.evaluate(() => { Object.defineProperty(window, 'RTCPeerConnection', { value: undefined, configurable: true }); });
  await page.locator('#name').fill('Astrid'); await page.locator('#create').tap();
  await expect(page.locator('#lobby-status')).toContainText('does not support WebRTC');
  await page.locator('#solo').tap(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
});

test('WebKit touch clients synchronize using the retained dedicated WebSocket transport', async ({ page: a, browser, browserName }) => {
  test.skip(browserName !== 'webkit', 'WebRTC is covered directly in the Chrome project.');
  const app = createGameServer({port:0,host:'127.0.0.1',dataDir:false}); await once(app.server,'listening');
  const ctx = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}), b = await ctx.newPage();
  try {
    const address = `${url}?server=${encodeURIComponent(`ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`)}`;
    await a.goto(address); await a.locator('#name').fill('Astrid'); await a.locator('#create').tap(); await expect(a.locator('#ready')).toBeVisible();
    const code = (await a.locator('#room-label').innerText()).split(' ')[1]; await b.goto(address); await b.locator('#name').fill('Bjorn'); await b.locator('#code').fill(code); await b.locator('#join').tap(); await expect(b.locator('#ready')).toBeVisible();
    await a.locator('#ready').tap(); await b.locator('#ready').tap(); await expect(b.locator('#simulation-status')).toHaveText('REAL TIME');
    await b.getByRole('button',{name:'Move east',exact:true}).tap(); await expect(b.locator('#position')).toHaveAttribute('data-x','18');
    await b.waitForTimeout(350); await b.locator('#touch-arrow').tap(); await tapTile(b,19,23);
    await expect(a.locator('#mobile-log')).toContainText('Bjorn fires a Magic Arrow'); await expect(b.locator('#mobile-vitals')).toContainText('27/30');
    await b.reload(); await expect(b.locator('#simulation-status')).toHaveText('REAL TIME'); await expect(a.locator('#mobile-partner')).toContainText('Connected');
  } finally {await ctx.close(); await a.close(); await app.close();}
});

test('real multi-touch pinch and long press do not move or cast', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium','CDP multi-touch input is available in Chromium; WebKit exercises taps and zoom buttons.');
  await start(page); const cdp=await context.newCDPSession(page), center=await tile(page,18,24);
  const cols=Number(await page.locator('#world').getAttribute('data-columns'));
  const input=async (type:string,spread:number) => cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:center.x-spread,y:center.y,id:1},{x:center.x+spread,y:center.y,id:2}]});
  await input('touchStart',25); await input('touchMove',60); await input('touchEnd',0);
  await expect.poll(async()=>Number(await page.locator('#world').getAttribute('data-columns'))).toBeLessThan(cols);
  await expect(page.locator('#position')).toHaveAttribute('data-x','18');
  const target=await tile(page,19,24); await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y,id:1}]}); await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await expect(page.locator('#toast')).toBeVisible(); await expect(page.locator('#position')).toHaveAttribute('data-x','18');
});


test('quick slots assign spells and potions without using them, execute the assigned action, and persist', async ({ page }, info) => {
  await page.goto(url); const game = createGame('SLOTSQ',42,'solo'); game.levels[0] = arena();
  const player = addPlayer(game,'slot-host','Astrid'); Object.assign(player,{hp:10,mana:5});
  game.levels[0].enemies.push({id:'target',name:'Ogre',icon:395,x:8,y:5,hp:100,maxHp:100,damage:1,nextMove:999999});
  await page.evaluate(game => { sessionStorage.setItem('castle-peer-host-v1',JSON.stringify({game,token:'slot-token'})); sessionStorage.setItem('castle-session',JSON.stringify({code:game.code,token:'slot-token',playerId:'slot-host',server:'peer'})); },game);
  await page.reload(); await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  const slot1=page.locator('[data-quick-slot="0"]'), slot2=page.locator('[data-quick-slot="1"]');
  await expect(slot1).toHaveAttribute('data-assigned','bolt'); await expect(slot2).toHaveAttribute('data-assigned','potion');
  await page.getByRole('button',{name:'Spells',exact:true}).tap(); await page.locator('[data-spell=heal]').tap();
  await expect(page.locator('#cast-spell')).toBeDisabled();
  await page.locator('[data-assign-slot="0"]').tap(); await expect(page.locator('[data-assign-slot="0"]')).toHaveText('Assigned to slot 1');
  await expect(page.locator('#mobile-vitals')).toContainText('10/60'); await expect(page.locator('#mobile-vitals')).toContainText('5/30');
  await page.locator('#close-dialog').tap(); await expect(slot1).toHaveAttribute('data-assigned','heal'); await expect(slot1).toBeDisabled();
  await page.getByRole('button',{name:'Pack',exact:true}).tap(); await page.locator('[data-potion=mana]').tap();
  await page.locator('[data-assign-slot="1"]').tap(); await expect(page.locator('[data-potion=mana]')).toContainText('Quantity: 2');
  await page.setViewportSize({width:667,height:375});
  for(const id of ['0','1']) await expect(page.locator(`[data-assign-slot="${id}"]`)).toBeInViewport({ratio:1});
  await page.screenshot({path:info.outputPath('quick-slot-pack.png')}); await page.locator('#close-dialog').tap();
  await expect(slot2.locator('img')).toHaveAttribute('src',/233\.png$/); await expect(slot2).not.toContainText('Mana');
  await slot2.tap(); await expect(page.locator('#mobile-vitals')).toContainText('25/30'); await expect(slot2.locator('.quick-count')).toHaveText('1');
  await page.waitForTimeout(350); await slot1.tap(); await expect(page.locator('#mobile-vitals')).toContainText('30/60');
  await page.getByRole('button',{name:'Spells',exact:true}).tap(); await page.locator('[data-spell=fireball]').tap(); await page.locator('[data-assign-slot="0"]').tap(); await page.locator('#close-dialog').tap();
  await page.waitForTimeout(350); await slot1.tap(); await expect(page.locator('#mobile-log')).toContainText('casts at Ogre for 14');
  await page.getByRole('button',{name:'Pack',exact:true}).tap(); await page.locator('[data-potion=potion]').tap(); await page.locator('[data-assign-slot="0"]').tap(); await page.locator('#close-dialog').tap();
  await page.waitForTimeout(350); await slot1.tap(); await expect(page.locator('#mobile-vitals')).toContainText('60/60'); await expect(slot1.locator('.quick-count')).toHaveText('2'); await expect(slot1).toBeDisabled();
  await page.getByRole('button',{name:'Spells',exact:true}).tap(); await page.locator('[data-spell=bolt]').tap(); await page.locator('[data-assign-slot="1"]').tap(); await page.locator('#close-dialog').tap();
  await slot2.tap(); await expect(slot2).toHaveAttribute('aria-pressed','true'); await expect(slot1).toHaveAttribute('aria-pressed','false');
  await page.waitForTimeout(350); await tapTile(page,5,6); await expect(page.locator('#mobile-log')).toContainText('fires a Magic Arrow'); await expect(page.locator('#position')).toHaveAttribute('data-y','5');
  await page.locator('#cancel-aim').tap(); await expect(slot2).toHaveAttribute('aria-pressed','false');
  await page.reload(); await expect(slot1).toHaveAttribute('data-assigned','potion'); await expect(slot2).toHaveAttribute('data-assigned','bolt');
  await page.setViewportSize({width:390,height:844}); await fits(page); await page.screenshot({path:info.outputPath('quick-slot-icons.png')});
});

test('invalid saved quick slots fall back to defaults; empty potions can be assigned safely', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('castle-quick-slots-v1','["unknown","__proto__"]'));
  await page.goto(url); const game=createGame('EMPTYQ',42,'solo');game.levels[0]=arena();const p=addPlayer(game,'empty-host','Astrid');p.manaPotions=0;
  await page.evaluate(game => {sessionStorage.setItem('castle-peer-host-v1',JSON.stringify({game,token:'empty-token'}));sessionStorage.setItem('castle-session',JSON.stringify({code:game.code,token:'empty-token',playerId:'empty-host',server:'peer'}));},game);
  await page.reload(); await expect(page.locator('[data-quick-slot="0"]')).toHaveAttribute('data-assigned','bolt');
  await page.getByRole('button',{name:'Pack',exact:true}).tap();await page.locator('[data-potion=mana]').tap();await page.locator('[data-assign-slot="0"]').tap();await page.locator('#close-dialog').tap();
  await expect(page.locator('[data-quick-slot="0"]')).toBeDisabled();await expect(page.locator('[data-quick-slot="0"] .quick-count')).toHaveText('0');
});
