import { test, expect } from '@playwright/test';
import { createGame, addPlayer } from '../shared/engine';

test('refresh upgrades a legacy campaign without losing equipment or quick slots', async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://localhost:5173/castleofthebreakingwinds/');
  const game=createGame('OLDMAP',42,'solo');game.mapVersion=undefined;game.levels.push(structuredClone(game.levels[12]));
  const player=addPlayer(game,'legacy-host','Astrid');Object.assign(player,{x:13,y:16,gold:73,weapon:4,potions:8});
  await page.evaluate(game=>{
    localStorage.setItem('castle-quick-slots-v1',JSON.stringify(['mana','bolt']));
    sessionStorage.setItem('castle-peer-host-v1',JSON.stringify({game,token:'legacy-token'}));
    sessionStorage.setItem('castle-session',JSON.stringify({code:game.code,token:'legacy-token',playerId:'legacy-host',server:'peer'}));
  },game);
  await page.reload();await expect(page.locator('#simulation-status')).toHaveText('REAL TIME');
  await expect(page.locator('#location')).toHaveText('The northern hamlet');
  await expect(page.locator('#position')).toHaveAttribute('data-x','18');await expect(page.locator('#position')).toHaveAttribute('data-y','24');
  await expect(page.locator('#mobile-vitals')).toContainText('73 gold');await expect(page.locator('[data-quick-slot="0"]')).toHaveAttribute('data-assigned','mana');
  const backup=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('castle-peer-before-mobile-maps-v1')!));
  expect(backup.game.levels).toHaveLength(14);expect(backup.game.players[0].x).toBe(13);
  await page.getByRole('button',{name:'Pack',exact:true}).click();await expect(page.locator('[data-slot=weapon]')).toContainText('+4');await expect(page.locator('[data-potion=potion]')).toContainText('Quantity: 8');
  await page.locator('#close-dialog').click();await page.getByRole('button',{name:'Move east',exact:true}).click();await expect(page.locator('#position')).toHaveAttribute('data-x','19');
  await page.reload();await expect(page.locator('#position')).toHaveAttribute('data-x','19');
});
