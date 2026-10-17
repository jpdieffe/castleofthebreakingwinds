import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act } from '../shared/engine.ts';
import { gameFixture } from './fixtures.ts';
import type { Action } from '../shared/types.ts';

test('selling is authoritative, cooldown limited, cannot duplicate or sell equipped items', () => {
  const g = gameFixture(), p = g.players[0], other = g.players[1];
  g.levels[0].shop = { x:5, y:5 }; p.potions = 1; p.manaPotions = 1;
  act(g,p,{type:'sell',item:'potion'}); assert.equal(p.potions,0); assert.equal(p.gold,23); assert.equal(other.gold,20);
  act(g,p,{type:'sell',item:'mana'}); assert.equal(p.manaPotions,1);
  g.time += 300; assert.match(act(g,p,{type:'sell',item:'potion'})!,/None remaining/); assert.equal(p.gold,23);
  g.time += 300; assert.match(act(g,p,{type:'sell',item:'weapon'} as unknown as Action)!,/cannot be sold/); assert.equal(p.weapon,1);
  g.time += 300; p.x=15; assert.match(act(g,p,{type:'sell',item:'mana'})!,/shop entrance/); assert.equal(p.manaPotions,1);
  g.time += 300; p.x=5; act(g,p,{type:'sell',item:'mana'}); assert.equal(p.manaPotions,0); assert.equal(p.gold,26);
  g.time += 300; act(g,p,{type:'buy',item:'potion'}); assert.equal(p.potions,1); assert.equal(p.gold,16);
  g.time += 300; p.hp=0; assert.match(act(g,p,{type:'sell',item:'potion'})!,/down/); assert.equal(p.potions,1);
});
