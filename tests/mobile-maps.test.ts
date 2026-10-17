import { test } from 'node:test';
import assert from 'node:assert/strict';
import reference from '../shared/mobile-maps.json' with { type: 'json' };
import { makeWorld, passable, shopAt } from '../shared/world.ts';
import { createGame, addPlayer, migrateMaps, reveal, act } from '../shared/engine.ts';

test('all 19,619 map tiles, building footprints and signs equal the direct Java export', () => {
  const world=makeWorld(123);
  assert.equal(world.length,13);
  let tiles=0;
  for(const native of reference.levels) {
    const map=world[native.id];
    assert.deepEqual(map.mobileTiles,native.tiles);
    assert.deepEqual(map.decorations,native.decorations);
    assert.deepEqual(map.places,native.places);
    assert.deepEqual([map.width,map.height],[native.width,native.height]);
    native.tiles.forEach((tile,i)=>assert.equal(passable(map,i%map.width,Math.floor(i/map.width)),![0,2,5,7,15].includes(tile)));
    tiles+=native.tiles.length;
  }
  assert.equal(tiles,19619);
  assert.deepEqual(world[0].spawn,{x:18,y:24});
  assert.deepEqual(world[0].shop,{x:10,y:14});
  assert.deepEqual(world[0].portals.map(p=>[p.x,p.y,p.to]),[[18,4,1],[2,16,4]]);
  assert.equal(world[3].portals.length,1);assert.equal(world[12].portals.length,1);
});

test('native shop and sanctuary coordinates control trading and resting',()=>{
  const g=createGame('MAPQA2',1,'solo'),p=addPlayer(g,'a','Astrid');p.ready=true;g.status='playing';
  assert.equal(shopAt(g.levels[0],p),undefined);
  assert.match(act(g,p,{type:'buy',item:'potion'})!,/shop entrance/);
  Object.assign(p,{x:10,y:14,nextAction:0});act(g,p,{type:'buy',item:'potion'});assert.equal(p.potions,4);
  Object.assign(p,{x:24,y:14,hp:10,mana:0,nextAction:0});act(g,p,{type:'interact'});assert.equal(p.hp,60);assert.equal(p.mana,30);
  assert.equal(g.levels[4].shops?.length,5);
});

test('legacy maps upgrade once and preserve both adventurers and quick-slot-independent stats',()=>{
  const g=createGame('LEGACY',42);const a=addPlayer(g,'a','Astrid'),b=addPlayer(g,'b','Bjorn');
  g.mapVersion=undefined;g.levels.push(structuredClone(g.levels[12]));g.level=7;
  a.gold=123;a.weapon=5;a.hp=19;b.manaPotions=7;
  assert.equal(migrateMaps(g),true);assert.equal(g.level,4);assert.equal(g.levels.length,13);
  assert.deepEqual([a.id,a.gold,a.weapon,a.hp,b.id,b.manaPotions],['a',123,5,19,'b',7]);
  assert.ok(passable(g.levels[g.level],a.x,a.y));assert.ok(passable(g.levels[g.level],b.x,b.y));
  assert.notDeepEqual([a.x,a.y],[b.x,b.y]);assert.equal(migrateMaps(g),false);
});

test('native dungeon visibility stops at opaque walls, with shared vision for two players',()=>{
  const g=createGame('VISION',1),a=addPlayer(g,'a','Astrid'),b=addPlayer(g,'b','Bjorn');
  g.level=1;const m=g.levels[1];Object.assign(a,m.spawn);Object.assign(b,m.spawn);
  m.tiles[5*m.width+9]='wall';m.tiles[5*m.width+10]='floor';reveal(g);
  assert.ok(m.visible?.includes(5*m.width+9));assert.ok(!m.visible?.includes(5*m.width+10));
  b.x=10;b.y=5;reveal(g);assert.ok(m.visible?.includes(5*m.width+10));
  Object.assign(b,m.spawn);m.tiles[5*m.width+9]='door';g.status='playing';act(g,a,{type:'move',dx:1,dy:0});
  assert.equal(m.tiles[5*m.width+9],'open');assert.ok(m.visible?.includes(5*m.width+10));
});
