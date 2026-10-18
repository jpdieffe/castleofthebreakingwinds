import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, addPlayer, createGame, step, updateStatus } from '../shared/engine.ts';
import { arena } from './fixtures.ts';

function fixture(mode: 'solo' | 'coop' = 'solo') {
  const g = createGame('TURNS1', 42, mode, 'turn-based'); g.levels[0] = arena();
  const a = addPlayer(g, 'a', 'Astrid');
  const b = mode === 'coop' ? addPlayer(g, 'b', 'Bjorn') : undefined;
  Object.assign(a, { x:5, y:5 }); if (b) Object.assign(b, { x:7, y:5 });
  g.players.forEach(p => act(g,p,{type:'ready'}));
  const enemy = { id:'rat', name:'Rat', icon:381, x:5, y:9, hp:100, maxHp:100, damage:3, nextMove:99999 };
  g.levels[0].enemies.push(enemy);
  return {g,a,b,enemy};
}

test('turn-based solo freezes while idle, then enemies act exactly once per valid action', () => {
  const {g,a,enemy}=fixture(); a.mana=10;
  for(let i=0;i<100;i++)step(g,100);
  assert.equal(g.time,0); assert.equal(g.turn,1); assert.equal(enemy.y,9); assert.equal(a.mana,10);
  act(g,a,{type:'move',dx:1,dy:0}); assert.equal(g.turn,2); assert.equal(enemy.y,8);
  act(g,a,{type:'wait'}); assert.equal(g.turn,3); assert.equal(enemy.y,7);
  act(g,a,{type:'wait'}); assert.equal(g.turn,4); assert.equal(a.mana,11);
  const hp=a.hp; for(let i=0;i<100;i++)step(g,100); assert.equal(a.hp,hp);assert.equal(g.turn,4);
});

test('blocked moves, unaffordable purchases and invalid spells do not spend turns', () => {
  const {g,a,enemy}=fixture();g.levels[0].tiles[5*g.levels[0].width+6]='wall';a.mana=0;a.gold=0;g.levels[0].shop={x:5,y:5};
  for(const action of [{type:'move',dx:1,dy:0},{type:'bolt',x:8,y:5},{type:'potion'},{type:'buy',item:'potion'},{type:'sell',item:'mana'}] as const) {
    if(action.type==='sell')a.manaPotions=0;
    act(g,a,action);assert.equal(g.turn,1);assert.deepEqual(g.acted,[]);assert.equal(enemy.y,9);
  }
  g.levels[0].tiles[5*g.levels[0].width+6]='door';act(g,a,{type:'move',dx:1,dy:0});assert.equal(g.turn,2);assert.equal(a.x,5);
});

test('co-op gives both living players one action, rejects double actions and preserves a partial turn on reconnect', () => {
  let {g,a,b,enemy}=fixture('coop');
  act(g,a,{type:'move',dx:0,dy:-1});assert.deepEqual(g.acted,['a']);assert.equal(enemy.y,9);
  assert.match(act(g,a,{type:'wait'})!,/companion/);assert.equal(g.turn,1);
  b!.connected=false;updateStatus(g);assert.equal(g.status,'paused');step(g,100);assert.equal(g.time,0);
  g=JSON.parse(JSON.stringify(g));a=g.players[0];b=g.players[1];b.connected=true;updateStatus(g);
  assert.match(act(g,a,{type:'wait'})!,/companion/);
  act(g,b,{type:'wait'});assert.equal(g.turn,2);assert.deepEqual(g.acted,[]);assert.equal(g.levels[0].enemies[0].y,8);
});

test('downed partners do not block turns; revival, defeat and restart retain the chosen pace', () => {
  const {g,a,b,enemy}=fixture('coop'); b!.hp=0;act(g,a,{type:'wait'});assert.equal(g.turn,2);
  b!.x=6;act(g,a,{type:'revive'});assert.ok(b!.hp>0);assert.equal(g.turn,2);assert.deepEqual(g.acted,['a']);
  act(g,b!,{type:'wait'});assert.equal(g.turn,3);
  enemy.x=5;enemy.y=6;a.hp=1;b!.hp=0;act(g,a,{type:'wait'});assert.equal(g.status,'defeated');
  act(g,a,{type:'restart'});assert.equal(g.pace,'turn-based');assert.equal(g.turn,1);assert.deepEqual(g.acted,[]);
});

test('arrows animate after a turn, and equipment purchases consume one action per player', () => {
  const {g,a,b}=fixture('coop');g.levels[0].shop={x:5,y:5};a.gold=100;
  act(g,a,{type:'buy',item:'weapon'});assert.equal(a.weapon,2);assert.equal(a.gold,65);assert.equal(g.turn,1);
  act(g,b!,{type:'bolt',x:10,y:5});assert.equal(g.turn,2);assert.equal(g.arrows?.length,1);
  const copy=JSON.parse(JSON.stringify(g));assert.equal(copy.pace,'turn-based');assert.equal(copy.players[0].weapon,2);
});

test('missing pace remains real-time and turn-based solo restart resumes without a companion', () => {
  const {g,a}=fixture();g.status='defeated';act(g,a,{type:'restart'});assert.equal(g.status,'playing');assert.equal(g.pace,'turn-based');
  delete g.pace;step(g,100);assert.equal(g.time,100);
});


test('travel consumes one co-op action and the companion completes the round on the new map', () => {
  const {g,a,b}=fixture('coop');g.levels[0].enemies=[];g.levels[1]=arena();g.levels[1].id=1;
  g.levels[0].portals=[{x:5,y:5,to:1,label:'Down'}];g.levels[1].portals=[{x:5,y:5,to:0,label:'Up'}];
  b!.x=15;assert.match(act(g,a,{type:'interact'})!,/Both/);assert.equal(g.turn,1);assert.deepEqual(g.acted,[]);
  b!.x=7;act(g,a,{type:'interact'});assert.equal(g.level,1);assert.equal(g.turn,1);assert.deepEqual(g.acted,['a']);
  act(g,b!,{type:'wait'});assert.equal(g.turn,2);assert.deepEqual(g.acted,[]);
});
