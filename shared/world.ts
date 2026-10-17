import maps from '../public/classic/maps.json' with { type: 'json' };
import type { Level, Tile, Enemy, Point } from './types.ts';
import { creatureArt } from './art.ts';

export function random(seed: number) {
  let value = seed >>> 0;
  return (max: number) => {
    value = (Math.imul(value, 214013) + 2531011) >>> 0;
    return ((value >>> 16) & 0x7fff) % max;
  };
}
export function at(level: Level, x: number, y: number): Tile {
  return x < 0 || y < 0 || x >= level.width || y >= level.height ? 'wall' : level.tiles[y * level.width + x];
}
export function passable(level: Level, x: number, y: number): boolean {
  return ['floor', 'grass', 'open'].includes(at(level, x, y));
}
export function distance(a: Point, b: Point) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
function reachable(level: Level, start: Point): Point[] {
  const queue = [start], seen = new Set([`${start.x},${start.y}`]);
  for (let i = 0; i < queue.length; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = queue[i].x + dx, y = queue[i].y + dy, key = `${x},${y}`;
    if (!seen.has(key) && (passable(level, x, y) || at(level, x, y) === 'door')) { seen.add(key); queue.push({ x, y }); }
  }
  return queue;
}

function base(id: number, name: string, width: number, height: number, safe = false): Level {
  return { id, name, width, height, tiles: Array<Tile>(width * height).fill('wall'),
    decorations: [], enemies: [], loot: [], portals: [], spawn: { x: 3, y: 3 },
    explored: [], safe };
}

const enemyTypes = [
  { name: 'Giant Rat', icon: 387 }, { name: 'Kobold', icon: 421 },
  { name: 'Goblin', icon: 427 }, { name: 'Skeleton', icon: 389 },
  { name: 'Giant Spider', icon: 391 }, { name: 'Orc', icon: 429 },
  { name: 'Ogre', icon: 425 }, { name: 'Troll', icon: 413 },
];
function enemy(id: string, p: Point, depth: number, index: number): Enemy {
  const kind = enemyTypes[Math.min(enemyTypes.length - 1, Math.max(0, depth - 1 + index % 3))];
  const hp = 12 + depth * 5;
  return { ...p, id, ...kind, icon: creatureArt[kind.name] ?? kind.icon, hp, maxHp: hp, damage: 2 + Math.floor(depth / 2), nextMove: 1200 + index * 170 };
}
function original(id: number, mapIndex: number, safe: boolean, seed: number): Level {
  const recovered = maps[mapIndex];
  const level = base(id, recovered.name, recovered.width, recovered.height, safe);
  level.source = `CASTLE1.EXE segment ${recovered.segment} Â· recovered tile plane`;
  level.rawTiles = [];
  for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) {
    const raw = recovered.tiles[y * 64 + x] ?? 0;
    level.rawTiles.push(raw);
    level.tiles[y * level.width + x] = raw === 3 || raw === 4 || raw === 86 || raw === 130 || raw === 131 ? 'grass'
      : raw === 5 ? 'tree' : raw === 6 ? 'water'
      : [1, 2, 8, 10, 18, 19].includes(raw) ? 'floor'
      : [16, 25].includes(raw) ? 'door' : 'wall';
  }
  // Original multi-cell building IDs are preserved. Graphics are anchored at their first cell.
  const art: Record<number, [number, number, number]> = {
    100: [192, 2, 2], 101: [193, 3, 1], 103: [191, 3, 3], 104: [249, 5, 5],
    105: [194, 3, 3], 106: [191, 3, 3], 107: [192, 2, 2], 108: [191, 3, 3],
    109: [193, 3, 1], 110: [191, 3, 3], 111: [197, 3, 3], 112: [198, 3, 3],
    113: [200, 2, 2], 114: [241, 3, 2], 115: [242, 3, 2], 116: [243, 3, 2],
    117: [244, 2, 3], 118: [245, 3, 4], 119: [246, 2, 2], 120: [247, 3, 4],
    121: [248, 3, 4], 122: [250, 5, 5], 123: [251, 5, 5],
  };
  for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) {
    const tile = level.rawTiles[y * level.width + x], spec = art[tile];
    if (spec && level.rawTiles[y * level.width + x - 1] !== tile && level.rawTiles[(y - 1) * level.width + x] !== tile) {
      level.decorations.push({ x, y, image: `bitmap-${spec[0]}`, width: spec[1], height: spec[2] });
    }
  }
  const floors = floorPositions(level);
  const unchecked = new Set(floors.map(p => `${p.x},${p.y}`));
  let largest: Point[] = [];
  for (const p of floors) if (unchecked.has(`${p.x},${p.y}`)) {
    const component = reachable(level, p); component.forEach(p => unchecked.delete(`${p.x},${p.y}`));
    if (component.length > largest.length) largest = component;
  }
  largest = largest.filter(p => passable(level, p.x, p.y));
  level.spawn = mapIndex === 0 ? { x: 13, y: 16 } : largest[Math.floor(largest.length / 2)] ?? { x: 3, y: 3 };
  if (safe) level.shop = { ...level.spawn, y: level.spawn.y - 1 };
  const rng = random(seed + id);
  if (!safe) for (let n = 0; n < 9; n++) {
    const p = largest[rng(largest.length)];
    if (p && distance(p, level.spawn) > 5 && !level.enemies.some(e => distance(e, p) === 0)) level.enemies.push(enemy(`${id}-e${n}`, p, Math.max(1, Math.floor(id / 2)), n));
  }
  return level;
}
export function floorPositions(level: Level) {
  const positions: Point[] = [];
  for (let y = 1; y < level.height - 1; y++) for (let x = 1; x < level.width - 1; x++) if (passable(level, x, y)) positions.push({ x, y });
  return positions;
}
function dungeon(id: number, depth: number, seed: number): Level {
  const level = base(id, depth <= 4 ? `The Mine Â· Level ${depth}` : `Hrungnir's Stronghold Â· Level ${depth - 4}`, 48, 40);
  const rng = random(seed + id * 997), centers: Point[] = [];
  // New connected generator informed by the original room dimensions and MS C RNG.
  // It is intentionally not represented as a byte-for-byte port of segment 11.
  for (let ry = 0; ry < 3; ry++) for (let rx = 0; rx < 4; rx++) {
    const x = rx * 11 + 2, y = ry * 12 + 2, w = 6 + rng(4), h = 6 + rng(4);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) level.tiles[yy * level.width + xx] = 'floor';
    const c = { x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) };
    const prev = centers.at(-1);
    if (prev) {
      for (let xx = Math.min(prev.x, c.x); xx <= Math.max(prev.x, c.x); xx++) level.tiles[prev.y * level.width + xx] = 'floor';
      for (let yy = Math.min(prev.y, c.y); yy <= Math.max(prev.y, c.y); yy++) level.tiles[yy * level.width + c.x] = 'floor';
      if (ry === Math.floor((centers.length - 1) / 4)) level.tiles[c.y * level.width + x - 1] = 'door';
    }
    centers.push(c);
  }
  level.spawn = centers[0];
  centers.slice(1).forEach((p, i) => {
    level.enemies.push(enemy(`${id}-e${i}`, p, depth, i));
    level.loot.push({ id: `${id}-l${i}`, x: p.x + 1, y: p.y, kind: i % 3 === 0 ? 'potion' : i % 3 === 1 ? 'gold' : 'mana', amount: i % 3 === 1 ? 12 + depth * 3 : 1 });
  });
  level.loot.push({ id: `${id}-weapon`, x: centers[5].x, y: centers[5].y + 1, kind: depth % 2 ? 'weapon' : 'armor', amount: Math.ceil(depth / 2) });
  if (depth === 8) {
    const boss = enemy(`${id}-hrungnir`, centers.at(-1)!, 10, 0);
    Object.assign(boss, { name: 'Hrungnir, the Hill Giant Lord', icon: 425, hp: 180, maxHp: 180, damage: 9, boss: true });
    level.enemies.push(boss);
  }
  level.source = 'Reconstructed dungeon generator Â· original MS C random sequence';
  return level;
}
export function makeWorld(seed: number): Level[] {
  const levels = [original(0, 0, true, seed), original(1, 2, false, seed), original(2, 3, false, seed),
    ...[1, 2, 3, 4].map(d => dungeon(d + 2, d, seed)), original(7, 4, true, seed),
    original(8, 5, false, seed), original(9, 6, false, seed),
    ...[5, 6, 7, 8].map(d => dungeon(d + 5, d, seed))];
  levels.forEach((level, index) => {
    const floors = reachable(level, level.spawn).filter(p => passable(level, p.x, p.y));
    // New co-op exits connect the recovered areas. Preserve the original raw tile plane separately.
    if (index > 0) level.portals.push({ ...level.spawn, to: index - 1, label: 'Return' });
    if (index < levels.length - 1) {
      const destination = index === 0 ? { x: 13, y: 2 } : floors.reduce((a, b) => distance(a, level.spawn) > distance(b, level.spawn) ? a : b, floors[0]);
      level.portals.push({ ...destination, to: index + 1, label: levels[index + 1].name });
    }
  });
  return levels;
}
