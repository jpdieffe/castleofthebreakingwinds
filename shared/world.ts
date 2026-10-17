import reference from './mobile-maps.json' with { type: 'json' };
import type { Level, Tile, Point } from './types.ts';

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
  return ['floor', 'grass', 'road', 'bridge', 'open'].includes(at(level, x, y));
}
export function distance(a: Point, b: Point) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

export const MOBILE_MAP_VERSION = 2;
// Exact tile semantics of Game.java. Special floor features retain their native
// IDs for rendering; combat/items continue to use the online engine.
const nativeTiles: Tile[] = ['wall','floor','door','floor','floor','tree','grass','water','floor','road','floor','grass','road','floor','bridge','wall','floor','floor','floor','floor'];
export function floorPositions(level: Level) {
  const positions: Point[] = [];
  for (let y=1;y<level.height-1;y++) for(let x=1;x<level.width-1;x++) if(passable(level,x,y)) positions.push({x,y});
  return positions;
}
export function shopAt(level: Level, player: Point) {
  return (level.shops ?? (level.shop ? [level.shop] : [])).find(p => distance(player,p) <= 2);
}
export function makeWorld(seed: number): Level[] {
  const rng=random(seed);
  const levels: Level[] = reference.levels.map(m => {
    const safe=m.id===0||m.id===4, depth=m.id<=3?m.id:m.id-4;
    const level: Level = {
      id:m.id, name:m.name.replaceAll('\u00c2\u00b7','\u00b7'), width:m.width,height:m.height,
      tiles:m.tiles.map(t=>nativeTiles[t]), mobileTiles:[...m.tiles],
      source:'CastleWinds_Mobile Game.java direct export; seed 42; Part I',
      decorations:structuredClone(m.decorations), places:structuredClone(m.places),
      spawn:{...m.spawn},safe,explored:[],portals:[],
      shops:m.places.filter(p=>['general','armor','weapons','magic','outfitters','junk'].includes(p.role)).map(p=>({x:p.doorX,y:p.doorY})),
      restPoints:m.places.filter(p=>p.role==='temple').map(p=>({x:p.doorX,y:p.doorY})),
      enemies:m.enemies.map((e,i)=>({...e,id:`${m.id}-e${i}`,hp:e.boss?180:12+depth*5,maxHp:e.boss?180:12+depth*5,damage:e.boss?9:2+Math.floor(depth/2),nextMove:1200+rng(600)})),
      loot:[],
    };
    level.shop=level.shops?.[0];
    for(const [i,l] of m.loot.entries()) {
      const kind = l.kind === 'gold' ? 'gold' : l.kind==='healing' ? 'potion' : l.kind==='mana' ? 'mana' : l.kind==='weapon' ? 'weapon' : l.kind==='armor' ? 'armor' : undefined;
      if(kind && passable(level,l.x,l.y)) level.loot.push({id:`${m.id}-l${i}`,x:l.x,y:l.y,kind,amount:kind==='gold'?12+depth*3:kind==='weapon'||kind==='armor'?Math.max(1,Math.ceil(depth/2)):1});
    }
    return level;
  });
  const portal=(id:number,p:Point,to:number)=>levels[id].portals.push({...p,to,label:levels[to].name});
  portal(0,reference.levels[0].down,1); portal(0,{x:2,y:16},4);
  portal(4,{x:34,y:16},0); portal(4,reference.levels[4].down,5);
  for(const m of reference.levels) if(!levels[m.id].safe) {
    portal(m.id,m.up,m.id===1?0:m.id===5?4:m.id-1);
    if(m.id!==3&&m.id!==12) portal(m.id,m.down,m.id+1);
  }
  return levels;
}
