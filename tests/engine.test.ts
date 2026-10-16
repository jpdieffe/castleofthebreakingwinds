import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, addPlayer, createGame, ENEMY_INTERVAL, reveal, snapshot, step, updateStatus } from '../server/engine.ts';
import { distance, makeWorld, passable, random } from '../server/world.ts';
import { arena, gameFixture } from './fixtures.ts';

test('requires exactly two ready players, caps admission at two', () => {
  const g = createGame('ABC123', 1), a = addPlayer(g, 'a', 'A'); act(g, a, { type: 'ready' });
  step(g, 100); assert.equal(g.time, 0); const b = addPlayer(g, 'b', 'B');
  assert.throws(() => addPlayer(g, 'c', 'C')); assert.equal(g.status, 'waiting');
  act(g, b, { type: 'ready' }); step(g, 100); assert.equal(g.status, 'playing'); assert.equal(g.time, 100);
});

test('solo simulation runs with one ready adventurer and rejects a second seat', () => {
  const g = createGame('SOLO01', 1, 'solo'), p = addPlayer(g, 'a', 'Astrid');
  act(g, p, { type: 'ready' }); step(g, 100);
  assert.equal(g.status, 'playing'); assert.equal(g.time, 100);
  assert.throws(() => addPlayer(g, 'b', 'Bjorn'), /solo/);
  p.connected = false; step(g, 100); assert.equal(g.status, 'paused'); assert.equal(g.time, 100);
});

test('solo defeat and restart preserve mode and resume without a missing partner', () => {
  const g = createGame('SOLO02', 1, 'solo'), p = addPlayer(g, 'a', 'Astrid');
  act(g, p, { type: 'ready' }); p.hp = 0; step(g, 100);
  assert.equal(g.status, 'defeated'); act(g, p, { type: 'restart' });
  assert.equal(g.mode, 'solo'); assert.equal(g.status, 'playing');
  assert.equal(g.players.length, 1); assert.equal(g.players[0].hp, 60);
  assert.equal(g.players[0].id, 'a'); assert.ok(g.levels[0].explored.length);
});

test('older saves without a mode still require two adventurers', () => {
  const g = createGame('OLD001', 1); delete g.mode;
  const p = addPlayer(g, 'a', 'Astrid'); act(g, p, { type: 'ready' }); step(g, 100);
  assert.equal(g.status, 'waiting'); assert.equal(g.time, 0);
});
test('movement is authoritative, cooldown-limited, and rejects teleport coordinates', () => {
  const g = gameFixture(), p = g.players[0]; act(g, p, { type: 'move', dx: 1, dy: 0 }); assert.equal(p.x, 6);
  act(g, p, { type: 'move', dx: 1, dy: 0 }); assert.equal(p.x, 6);
  g.time += 300; act(g, p, { type: 'move', dx: 100, dy: 0 }); assert.equal(p.x, 6);
  g.time += 300; act(g, p, { type: 'move', dx: NaN, dy: 0 }); assert.equal(p.x, 6);
});
test('walls, player collision and diagonal corner cutting are blocked', () => {
  const g = gameFixture(), p = g.players[0], map = g.levels[0];
  map.tiles[5 * map.width + 6] = 'wall'; act(g, p, { type: 'move', dx: 1, dy: 1 }); assert.deepEqual([p.x, p.y], [5, 5]);
  g.time += 300; act(g, p, { type: 'move', dx: 1, dy: 0 }); assert.equal(p.x, 5);
  map.tiles[5 * map.width + 6] = 'floor'; g.players[1].x = 6; g.time += 300;
  act(g, p, { type: 'move', dx: 1, dy: 0 }); assert.equal(p.x, 5);
});
test('bumping a door opens it without moving; next step enters', () => {
  const g = gameFixture(), p = g.players[0], map = g.levels[0]; map.tiles[5 * map.width + 6] = 'door';
  act(g, p, { type: 'move', dx: 1, dy: 0 }); assert.equal(p.x, 5); assert.equal(map.tiles[5 * map.width + 6], 'open');
  g.time += 300; act(g, p, { type: 'move', dx: 1, dy: 0 }); assert.equal(p.x, 6);
});
test('enemies move without player input, at the slow interval', () => {
  const g = gameFixture(), e = { id: 'rat', name: 'Rat', icon: 387, x: 5, y: 9, hp: 10, maxHp: 10, damage: 2, nextMove: 0 }; g.levels[0].enemies.push(e);
  step(g, 100); assert.equal(e.y, 8); for (let n = 0; n < 13; n++) step(g, 100); assert.equal(e.y, 8);
  step(g, 100); assert.equal(e.y, 7); assert.equal(ENEMY_INTERVAL, 1400);
});
test('combat and simulation freeze on disconnect and resume without catch-up damage', () => {
  const g = gameFixture(); g.players[1].connected = false; updateStatus(g); assert.equal(g.status, 'paused');
  for (let n = 0; n < 50; n++) step(g, 100); assert.equal(g.time, 0);
  g.players[1].connected = true; step(g, 100); assert.equal(g.status, 'playing'); assert.equal(g.time, 100);
});
test('melee, death, drops and shared experience occur once', () => {
  const g = gameFixture(), p = g.players[0], e = { id: 'rat', name: 'Rat', icon: 387, x: 6, y: 5, hp: 9, maxHp: 9, damage: 2, nextMove: 0 }; g.levels[0].enemies.push(e);
  act(g, p, { type: 'move', dx: 1, dy: 0 }); assert.equal(e.hp, 0); assert.equal(p.x, 5); assert.equal(g.players[1].xp, 12);
  g.time += 300; act(g, p, { type: 'attack' }); assert.equal(g.levels[0].loot.length, 1); assert.equal(p.kills, 1);
});
test('spell range, mana cost, wall occlusion and fireball area damage', () => {
  const g = gameFixture(), p = g.players[0], map = g.levels[0];
  map.enemies = [8, 9].map((x, i) => ({ id: `e${i}`, name: 'Rat', icon: 387, x, y: 5, hp: 30, maxHp: 30, damage: 1, nextMove: 99999 }));
  map.tiles[5 * map.width + 6] = 'wall'; act(g, p, { type: 'bolt' }); assert.equal(p.mana, 30); assert.equal(map.enemies[0].hp, 30);
  map.tiles[5 * map.width + 6] = 'floor'; g.time += 300; act(g, p, { type: 'fireball' }); assert.equal(p.mana, 22); assert.deepEqual(map.enemies.map(e => e.hp), [16, 16]);
  g.time += 300; p.mana = 0; act(g, p, { type: 'bolt' }); assert.equal(map.enemies[0].hp, 16);
});
test('potions and healing clamp stats and never consume at full health', () => {
  const g = gameFixture(), p = g.players[0]; act(g, p, { type: 'potion' }); assert.equal(p.potions, 3);
  g.time += 300; p.hp = 45; act(g, p, { type: 'potion' }); assert.equal(p.hp, 60); assert.equal(p.potions, 2);
  g.time += 300; p.hp = 10; act(g, p, { type: 'heal' }); assert.equal(p.hp, 30); assert.equal(p.mana, 24);
  g.time += 300; act(g, p, { type: 'mana' }); assert.equal(p.mana, 30); assert.equal(p.manaPotions, 1);
});
test('fallen players cannot move; revival requires adjacency and a potion', () => {
  const g = gameFixture(), [a, b] = g.players; b.hp = 0; act(g, b, { type: 'move', dx: 1, dy: 0 }); assert.equal(b.x, 7);
  act(g, a, { type: 'revive' }); assert.equal(b.hp, 0); b.x = 6; g.time += 300;
  a.potions = 0; act(g, a, { type: 'revive' }); assert.equal(b.hp, 0); a.potions = 1; g.time += 300;
  act(g, a, { type: 'revive' }); assert.equal(b.hp, 30); assert.equal(a.potions, 0);
});
test('party defeat, restart and boss victory are shared terminal states', () => {
  const g = gameFixture(); g.players.forEach(p => p.hp = 0); step(g, 100); assert.equal(g.status, 'defeated');
  act(g, g.players[0], { type: 'restart' }); assert.equal(g.status, 'waiting'); assert.equal(g.players.length, 2); assert.equal(g.players[0].hp, 60);
  const v = gameFixture(); v.levels[0].enemies.push({ id: 'boss', name: 'Hrungnir', icon: 425, x: 6, y: 5, hp: 1, maxHp: 180, damage: 9, nextMove: 0, boss: true });
  act(v, v.players[0], { type: 'attack' }); assert.equal(v.status, 'won'); const time = v.time; step(v, 100); assert.equal(v.time, time);
});
test('loot is collected once even when both players attempt the tile', () => {
  const g = gameFixture(), [a, b] = g.players; g.levels[0].loot.push({ id: 'g', x: 6, y: 5, kind: 'gold', amount: 9 });
  act(g, a, { type: 'move', dx: 1, dy: 0 }); act(g, b, { type: 'move', dx: -1, dy: 0 });
  assert.equal(a.gold + b.gold, 49); assert.equal(g.levels[0].loot.length, 0); assert.notEqual(a.x, b.x);
});
test('stairs require the whole living party and preserve visited levels', () => {
  const g = gameFixture(), a = g.players[0]; g.levels[0].portals = [{ x: 5, y: 5, to: 1, label: 'Next' }];
  const next = arena(); next.id = 1; next.portals = [{ x: 5, y: 5, to: 0, label: 'Back' }]; g.levels[1] = next;
  g.players[1].x = 12; act(g, a, { type: 'interact' }); assert.equal(g.level, 0);
  g.players[1].x = 7; g.time += 300; act(g, a, { type: 'interact' }); assert.equal(g.level, 1);
  g.time += 300; act(g, a, { type: 'interact' }); assert.equal(g.level, 0); assert.equal(g.levels[1], next);
});
test('shop charges server prices, checks range and rejects insufficient gold', () => {
  const g = gameFixture(), p = g.players[0]; g.levels[0].shop = { x: 5, y: 5 };
  act(g, p, { type: 'buy', item: 'potion' }); assert.equal(p.gold, 10); assert.equal(p.potions, 4);
  g.time += 300; act(g, p, { type: 'buy', item: 'weapon' }); assert.equal(p.weapon, 1); assert.equal(p.gold, 10);
  p.x = 15; g.time += 300; act(g, p, { type: 'buy', item: 'potion' }); assert.equal(p.gold, 10);
});
test('shared exploration and snapshot exclude other maps', () => {
  const g = gameFixture(); g.levels[0].explored = []; g.players[1].x = 18; reveal(g);
  assert.ok(g.levels[0].explored.includes(5 * 24 + 18)); assert.ok(!('levels' in snapshot(g)));
});
test('replacing a departed companion never teleports the remaining player', () => {
  const g = gameFixture(); g.players = [g.players[0]]; g.players[0].x = 18; g.players[0].y = 12;
  const replacement = addPlayer(g, 'new', 'New companion');
  assert.deepEqual([g.players[0].x, g.players[0].y], [18, 12]); assert.equal(distance(g.players[0], replacement), 1);
});
test('shared level-up does not revive a fallen partner for free', () => {
  const g = gameFixture(); g.players[1].hp = 0; g.players[1].xp = 44;
  g.levels[0].enemies.push({ id: 'rat', name: 'Rat', icon: 387, x: 6, y: 5, hp: 1, maxHp: 10, damage: 1, nextMove: 0 });
  act(g, g.players[0], { type: 'attack' }); assert.equal(g.players[1].rank, 2); assert.equal(g.players[1].hp, 0);
});
test('MS C generator is deterministic and bounded', () => {
  const a = random(123), b = random(123); for (let n = 0; n < 100; n++) { const value = a(17); assert.equal(value, b(17)); assert.ok(value >= 0 && value < 17); }
});
test('all campaign areas have reachable exits, collision-safe spawns and a final boss', () => {
  for (const seed of [1, 12345, 99999]) {
    const world = makeWorld(seed); assert.equal(world.length, 14);
    world.forEach(map => {
      assert.ok(passable(map, map.spawn.x, map.spawn.y), `${map.name} spawn`);
      const queue = [map.spawn], seen = new Set([`${map.spawn.x},${map.spawn.y}`]);
      for (let i = 0; i < queue.length; i++) for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
        const p = { x: queue[i].x + d.x, y: queue[i].y + d.y }, key = `${p.x},${p.y}`;
        if (!seen.has(key) && (passable(map, p.x, p.y) || map.tiles[p.y * map.width + p.x] === 'door')) { seen.add(key); queue.push(p); }
      }
      map.portals.forEach(p => assert.ok(seen.has(`${p.x},${p.y}`), `${map.name}: unreachable exit ${p.x},${p.y}`));
      assert.ok(map.enemies.every(e => passable(map, e.x, e.y)), `${map.name}: enemy in wall`);
      assert.ok(queue.some(p => distance(p, map.spawn) === 1), `${map.name}: companion spawn`);
    });
    assert.ok(world.at(-1)!.enemies.some(e => e.boss));
  }
});
