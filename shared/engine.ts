import type { Action, GameState, Player, Point, Snapshot } from './types.ts';
import { at, distance, makeWorld, passable } from './world.ts';

export const PLAYER_INTERVAL = 240;
export const ENEMY_INTERVAL = 1400;
export function log(game: GameState, text: string) {
  game.log.push({ id: game.nextLog++, text });
  if (game.log.length > 40) game.log.shift();
}
export function createGame(code: string, seed: number, mode: 'solo' | 'coop' = 'coop'): GameState {
  return { version: 1, mode, code, seed, levels: makeWorld(seed), level: 0, players: [], arrows: [], status: 'waiting',
    tick: 0, time: 0, log: [{ id: 0, text: mode === 'solo' ? 'A question of vengeance. Your adventure begins.' : 'A question of vengeance. This time, you need not face it alone.' }], nextLog: 1 };
}
export function addPlayer(game: GameState, id: string, name: string): Player {
  if (game.mode === 'solo' && game.players.length) throw new Error('This is a solo expedition.');
  if (game.players.length >= 2) throw new Error('This expedition already has two players.');
  const slot = game.players.some(p => p.slot === 0) ? 1 : 0;
  const spawn = game.players[0] ?? game.levels[game.level].spawn;
  const player: Player = { ...spawn, id, name, slot, connected: true, ready: false, hp: 60, maxHp: 60,
    mana: 30, maxMana: 30, potions: 3, manaPotions: 2, gold: 20, xp: 0, rank: 1, weapon: 1, armor: 0,
    nextAction: 0, facing: { x: 0, y: -1 }, kills: 0 };
  game.players.push(player);
  placePlayers(game, spawn, [player]);
  log(game, `${name} joined the expedition.`);
  return player;
}
function placePlayers(game: GameState, anchor: Point, players = game.players) {
  const map = game.levels[game.level];
  const occupied = new Set(game.players.filter(p => !players.includes(p)).map(p => `${p.x},${p.y}`));
  players.forEach(p => {
    for (let r = 0; r < 10; r++) {
      let done = false;
      for (let y = anchor.y - r; y <= anchor.y + r && !done; y++) for (let x = anchor.x - r; x <= anchor.x + r; x++) {
        if (passable(map, x, y) && !occupied.has(`${x},${y}`) && !map.enemies.some(e => e.hp > 0 && e.x === x && e.y === y)) {
          p.x = x; p.y = y; occupied.add(`${x},${y}`); done = true; break;
        }
      }
      if (done) break;
    }
  });
}
export function updateStatus(game: GameState) {
  if (game.status === 'won' || game.status === 'defeated') return;
  game.status = game.players.length !== (game.mode === 'solo' ? 1 : 2) || game.players.some(p => !p.ready) ? 'waiting'
    : game.players.some(p => !p.connected) ? 'paused' : 'playing';
}
export function reveal(game: GameState) {
  const map = game.levels[game.level], seen = new Set(map.explored);
  // The mobile reference shows the whole safe settlement immediately.
  if (map.safe) { map.explored = Array.from({ length: map.width * map.height }, (_, i) => i); return; }
  for (const p of game.players) for (let y = p.y - 7; y <= p.y + 7; y++) for (let x = p.x - 7; x <= p.x + 7; x++) {
    if (x >= 0 && y >= 0 && x < map.width && y < map.height && Math.hypot(x - p.x, y - p.y) <= 7.5) seen.add(y * map.width + x);
  }
  map.explored = [...seen];
}
function reward(game: GameState, amount: number) {
  game.players.forEach(p => {
    p.xp += amount;
    if (p.xp >= p.rank * 45) {
      p.xp -= p.rank * 45; p.rank++; p.maxHp += 10; p.maxMana += 5;
      if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + 15); p.mana = p.maxMana;
      log(game, `${p.name} reaches level ${p.rank}.`);
    }
  });
}
function hit(game: GameState, player: Player, enemyId: string, damage: number, spell = false) {
  const map = game.levels[game.level], enemy = map.enemies.find(e => e.id === enemyId);
  if (!enemy || enemy.hp <= 0) return;
  enemy.hp = Math.max(0, enemy.hp - damage);
  log(game, `${player.name} ${spell ? 'casts at' : 'strikes'} ${enemy.name} for ${damage}.`);
  if (!enemy.hp) {
    player.kills++; reward(game, enemy.boss ? 100 : 12);
    map.loot.push({ id: `${enemy.id}-drop`, x: enemy.x, y: enemy.y, kind: 'gold', amount: enemy.boss ? 100 : 8 });
    log(game, game.mode === 'solo' ? `${enemy.name} falls. You gain experience.` : `${enemy.name} falls. Experience is shared.`);
    if (enemy.boss) { game.status = 'won'; log(game, game.mode === 'solo' ? 'Hrungnir is defeated. Vengeance is yours.' : 'Hrungnir is defeated. Vengeance is yours - together.'); }
  }
}
function collect(game: GameState, player: Player) {
  const map = game.levels[game.level];
  map.loot = map.loot.filter(item => {
    if (distance(item, player)) return true;
    if (item.kind === 'gold') player.gold += item.amount;
    if (item.kind === 'potion') player.potions += item.amount;
    if (item.kind === 'mana') player.manaPotions += item.amount;
    if (item.kind === 'weapon') player.weapon = Math.max(player.weapon, item.amount + 1);
    if (item.kind === 'armor') player.armor = Math.max(player.armor, item.amount);
    log(game, `${player.name} picks up ${item.amount} ${item.kind}.`);
    return false;
  });
}
function lineOfSight(game: GameState, a: Point, b: Point) {
  const map = game.levels[game.level];
  const steps = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  for (let i = 1; i < steps; i++) {
    if (!passable(map, Math.round(a.x + (b.x - a.x) * i / steps), Math.round(a.y + (b.y - a.y) * i / steps))) return false;
  }
  return true;
}
export function act(game: GameState, player: Player, action: Action): string | undefined {
  if (action.type === 'ready') { player.ready = true; updateStatus(game); reveal(game); return; }
  if (action.type === 'restart') {
    if (!['defeated', 'won'].includes(game.status)) return 'The expedition is still in progress.';
    const identities = game.players.map(p => ({ id: p.id, name: p.name, connected: p.connected }));
    Object.assign(game, createGame(game.code, game.seed, game.mode));
    identities.forEach(p => { addPlayer(game, p.id, p.name).connected = p.connected; });
    if (game.mode === 'solo') { game.players[0].ready = true; updateStatus(game); reveal(game); }
    return;
  }
  if (game.status !== 'playing') return 'Waiting for two connected, ready adventurers.';
  if (player.hp <= 0) return 'You are down. Your partner can revive you with R.';
  if (game.time < player.nextAction) return;
  player.nextAction = game.time + PLAYER_INTERVAL;
  const map = game.levels[game.level];
  if (action.type === 'move') {
    const { dx, dy } = action;
    if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) return 'Invalid movement.';
    player.facing = { x: dx, y: dy };
    const x = player.x + dx, y = player.y + dy;
    if (dx && dy && (!passable(map, player.x + dx, player.y) || !passable(map, player.x, player.y + dy))) return;
    const target = map.enemies.find(e => e.hp > 0 && e.x === x && e.y === y);
    if (target) { hit(game, player, target.id, 6 + player.weapon * 2 + player.rank); return; }
    if (at(map, x, y) === 'door') { map.tiles[y * map.width + x] = 'open'; log(game, `${player.name} opens a door.`); return; }
    if (!passable(map, x, y) || game.players.some(p => p.id !== player.id && p.x === x && p.y === y)) return;
    player.x = x; player.y = y; collect(game, player); reveal(game); return;
  }
  if (action.type === 'bolt') {
    const { x, y } = action;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= map.width || y >= map.height) return 'Choose a point on the map.';
    const steps = Math.max(Math.abs(x - player.x), Math.abs(y - player.y));
    if (!steps) return 'Aim away from your adventurer.';
    if (player.mana < 3) return 'Magic Arrow costs 3 mana.';
    player.mana -= 3;
    player.facing = { x: Math.sign(x - player.x), y: Math.sign(y - player.y) };
    let end: Point = { x: player.x, y: player.y };
    let victim: string | undefined;
    for (let i = 1; i <= Math.min(6, steps); i++) {
      const next = { x: Math.round(player.x + (x - player.x) * i / steps), y: Math.round(player.y + (y - player.y) * i / steps) };
      if (next.x !== end.x && next.y !== end.y && (!passable(map, next.x, end.y) || !passable(map, end.x, next.y))) break;
      end = next;
      if (!passable(map, end.x, end.y)) break;
      victim = map.enemies.find(e => e.hp > 0 && e.x === end.x && e.y === end.y)?.id;
      if (victim) break;
    }
    log(game, `${player.name} fires a Magic Arrow toward ${x}, ${y}.`);
    game.arrows = [...(game.arrows ?? []).filter(a => game.time - a.created < 1000), {
      id: `${player.id}:${game.nextLog}`, level: game.level, from: { x: player.x, y: player.y }, to: end,
      created: game.time, duration: Math.max(250, distance(player, end) * 90),
    }].slice(-16);
    if (victim) hit(game, player, victim, 12 + player.rank * 2, true);
    return;
  }
  if (action.type === 'attack' || action.type === 'fireball') {
    const range = action.type === 'attack' ? 1 : 6;
    const targets = map.enemies.filter(e => e.hp > 0 && distance(e, player) <= range && lineOfSight(game, player, e)).sort((a, b) => distance(a, player) - distance(b, player));
    if (!targets.length) return 'No enemy in range and in sight.';
    const cost = action.type === 'fireball' ? 8 : 0;
    if (player.mana < cost) return 'Not enough mana.';
    player.mana -= cost;
    const victims = action.type === 'fireball' ? targets.filter(e => distance(e, targets[0]) <= 2) : [targets[0]];
    victims.forEach(e => hit(game, player, e.id, cost ? 12 + player.rank * 2 : 6 + player.weapon * 2 + player.rank, !!cost));
    return;
  }
  if (action.type === 'potion') {
    if (!player.potions) return 'No healing potions left.';
    if (player.hp === player.maxHp) return 'Health is already full.';
    player.potions--; player.hp = Math.min(player.maxHp, player.hp + 35); log(game, `${player.name} drinks a healing potion.`); return;
  }
  if (action.type === 'mana') {
    if (!player.manaPotions) return 'No mana potions left.';
    if (player.mana === player.maxMana) return 'Mana is already full.';
    player.manaPotions--; player.mana = Math.min(player.maxMana, player.mana + 20); return;
  }
  if (action.type === 'heal') {
    if (player.mana < 6) return 'Healing costs 6 mana.';
    if (player.hp === player.maxHp) return 'Health is already full.';
    player.mana -= 6; player.hp = Math.min(player.maxHp, player.hp + 20); return;
  }
  if (action.type === 'revive') {
    const partner = game.players.find(p => p.id !== player.id && p.hp === 0 && distance(player, p) <= 1);
    if (!partner) return 'Stand beside your fallen partner to revive them.';
    if (!player.potions) return 'Reviving your partner requires one healing potion.';
    player.potions--; partner.hp = Math.ceil(partner.maxHp / 2); log(game, `${player.name} revives ${partner.name}.`); return;
  }
  if (action.type === 'buy') {
    if (!map.shop || distance(player, map.shop) > 2) return 'Stand near the village well to trade.';
    const cost = { potion: 10, mana: 10, weapon: 35 * player.weapon, armor: 30 * (player.armor + 1) }[action.item];
    if (!cost || player.gold < cost) return 'Not enough gold.';
    player.gold -= cost;
    if (action.item === 'potion') player.potions++;
    if (action.item === 'mana') player.manaPotions++;
    if (action.item === 'weapon') player.weapon++;
    if (action.item === 'armor') player.armor++;
    log(game, `${player.name} buys ${action.item}.`); return;
  }
  if (action.type === 'interact') {
    const portal = map.portals.find(p => distance(player, p) <= 1);
    if (portal) {
      if (game.players.some(p => p.hp <= 0 || distance(p, portal) > 3)) return 'Both adventurers must be alive and within three tiles of the stairs.';
      const old = game.level; game.level = portal.to;
      const next = game.levels[game.level];
      const entry = next.portals.find(p => p.to === old) ?? next.spawn;
      placePlayers(game, entry); reveal(game);
      log(game, `You enter ${next.name}.`); return;
    }
    if (map.shop && distance(player, map.shop) <= 2) {
      player.hp = player.maxHp; player.mana = player.maxMana; log(game, `${player.name} rests at the village well.`); return;
    }
    collect(game, player);
    return 'Move onto treasure to collect it. Use E near stairs or the village well.';
  }
}
export function step(game: GameState, milliseconds: number) {
  updateStatus(game);
  if (game.status !== 'playing') return;
  game.time += Math.min(250, Math.max(0, milliseconds)); game.tick++;
  game.arrows = (game.arrows ?? []).filter(a => a.level === game.level && game.time - a.created < 1000);
  const map = game.levels[game.level];
  if (game.tick % 30 === 0) game.players.forEach(p => { if (p.hp > 0) p.mana = Math.min(p.maxMana, p.mana + 1); });
  for (const enemy of map.enemies) {
    if (enemy.hp <= 0 || game.time < enemy.nextMove) continue;
    enemy.nextMove = game.time + ENEMY_INTERVAL;
    const targets = game.players.filter(p => p.hp > 0).sort((a, b) => distance(a, enemy) - distance(b, enemy));
    const player = targets[0];
    if (!player || distance(player, enemy) > 9) continue;
    if (distance(player, enemy) <= 1 && lineOfSight(game, enemy, player)) {
      const damage = Math.max(1, enemy.damage - player.armor);
      player.hp = Math.max(0, player.hp - damage);
      log(game, `${enemy.name} hits ${player.name} for ${damage}.`);
      if (!player.hp) log(game, game.mode === 'solo' ? `${player.name} has fallen.` : `${player.name} is down! Stand beside them and press R to revive.`);
    } else {
      const options = [{ x: Math.sign(player.x - enemy.x), y: 0 }, { x: 0, y: Math.sign(player.y - enemy.y) }];
      if (Math.abs(player.y - enemy.y) > Math.abs(player.x - enemy.x)) options.reverse();
      for (const d of options) {
        const x = enemy.x + d.x, y = enemy.y + d.y;
        if ((!d.x && !d.y) || !passable(map, x, y) || game.players.some(p => p.x === x && p.y === y) || map.enemies.some(e => e.hp > 0 && e.id !== enemy.id && e.x === x && e.y === y)) continue;
        enemy.x = x; enemy.y = y; break;
      }
    }
  }
  if (game.players.length > 0 && game.players.every(p => p.hp === 0)) { game.status = 'defeated'; log(game, 'The expedition has fallen. Begin again to try a new approach.'); }
}
export function snapshot(game: GameState): Snapshot {
  const { levels, ...state } = game;
  return { ...state, map: levels[game.level] };
}
