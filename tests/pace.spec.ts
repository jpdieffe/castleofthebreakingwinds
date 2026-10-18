import { test, expect, type Page } from '@playwright/test';
import { createGame, addPlayer } from '../shared/engine';
import { arena } from './fixtures';

const url = 'http://localhost:5173/castleofthebreakingwinds/';
async function press(page: Page, selector: string) {
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.locator(selector).tap();
  else await page.locator(selector).click();
}
async function waitTurn(page: Page) { await press(page, await page.locator('#wait-turn').isVisible() ? '#wait-turn' : '#touch-attack'); }
const status = (page: Page) => page.locator('#simulation-status');

test('creation selects turn-based solo, keeps turns idle, exposes Wait and restores the choice', async ({page}, info) => {
  await page.goto(url); await expect(page.locator('#game-pace')).toHaveValue('realtime');
  await page.locator('#name').fill('Astrid'); await page.locator('#game-pace').selectOption('turn-based');
  await expect(page.locator('#pace-help')).toContainText('Wait passes');
  await page.screenshot({path:info.outputPath('pace-choice.png')});
  await press(page,'#solo'); await expect(status(page)).toContainText('TURN 1');
  await page.waitForTimeout(1700); await expect(status(page)).toContainText('TURN 1');
  await page.keyboard.down('ArrowRight'); await expect(page.locator('#position')).toHaveAttribute('data-x','19');
  await page.waitForTimeout(1000); await page.keyboard.up('ArrowRight');
  await expect(page.locator('#position')).toHaveAttribute('data-x','19'); await expect(status(page)).toContainText('TURN 2');
  await waitTurn(page); await expect(status(page)).toContainText('TURN 3');
  await page.reload(); await expect(status(page)).toContainText('TURN 3');
  for (const [width,height] of [[320,568],[844,390],[568,320]]) {
    await page.setViewportSize({width,height}); await expect(page.getByRole('button',{name:'Wait one turn',exact:true})).toBeInViewport({ratio:1});
    await expect(page.locator('#mobile-log')).toBeInViewport({ratio:1});
  }
});

test('turn-based enemies remain still while menus are open and move once after an action', async ({page}) => {
  await page.goto(url);
  const game=createGame('TURN01',42,'solo','turn-based');game.levels[0]=arena();addPlayer(game,'turn-host','Astrid');
  game.levels[0].enemies.push({id:'rat',name:'Rat',icon:381,x:5,y:6,hp:100,maxHp:100,damage:3,nextMove:0});
  await page.evaluate(game=>{sessionStorage.setItem('castle-peer-host-v1',JSON.stringify({game,token:'turn-token'}));sessionStorage.setItem('castle-session',JSON.stringify({code:game.code,token:'turn-token',playerId:'turn-host',server:'peer'}));},game);
  await page.reload();await expect(status(page)).toContainText('TURN 1');await page.keyboard.press('i');
  await page.waitForTimeout(1700);await expect(page.locator('[data-vitals]')).toContainText('HP 60/60');
  await press(page,'#close-dialog');await waitTurn(page);await expect(status(page)).toContainText('TURN 2');
  await expect(page.locator('#mobile-log')).toContainText('Rat hits Astrid for 3');
  await page.keyboard.press('i');await expect(page.locator('[data-vitals]')).toContainText('HP 57/60');
  await page.waitForTimeout(1700);await expect(page.locator('[data-vitals]')).toContainText('HP 57/60');
});

test('two WebRTC clients inherit host pace and resume a partially completed co-op turn', async ({page:a,browser,browserName}) => {
  test.skip(browserName==='webkit','This Windows WebKit build has no WebRTC; server transport is covered separately.');
  test.setTimeout(90000);
  const context=await browser.newContext(),b=await context.newPage();
  try {
    await a.goto(url);await a.locator('#name').fill('Astrid');await a.locator('#game-pace').selectOption('turn-based');await press(a,'#create');
    await expect(a.locator('#ready')).toBeVisible({timeout:25000});
    const code=(await a.locator('#room-label').textContent())!.split(' ')[1];
    await b.goto(url);await b.locator('#name').fill('Bjorn');await expect(b.locator('#game-pace')).toHaveValue('realtime');
    await b.locator('#code').fill(code);await b.locator('#join').click();await expect(b.locator('#ready')).toBeVisible({timeout:25000});
    await expect(b.locator('#party-message')).toContainText('Turn-based');await press(a,'#ready');await b.locator('#ready').click();
    await expect(status(a)).toContainText('TURN 1');await expect(status(b)).toContainText('TURN 1');
    await a.keyboard.press('ArrowRight');await expect(status(a)).toContainText('WAITING');await expect(status(b)).toContainText('YOUR MOVE');
    await a.keyboard.press('ArrowRight');await expect(a.locator('#position')).toHaveAttribute('data-x','19');
    await b.reload();await expect(status(b)).toContainText('YOUR MOVE',{timeout:25000});await expect(status(a)).toContainText('WAITING');
    await waitTurn(b);await expect(status(a)).toContainText('TURN 2');await expect(status(b)).toContainText('TURN 2');
    await waitTurn(a);await expect(status(a)).toContainText('WAITING');await a.reload();
    await expect(status(a)).toContainText('WAITING',{timeout:30000});await expect(status(b)).toContainText('YOUR MOVE',{timeout:30000});
    await waitTurn(b);await expect(status(a)).toContainText('TURN 3');await expect(status(b)).toContainText('TURN 3');
  }finally{await context.close();}
});
