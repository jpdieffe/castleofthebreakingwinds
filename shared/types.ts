export type Point = { x: number; y: number };
export type Tile = 'wall' | 'floor' | 'grass' | 'road' | 'bridge' | 'tree' | 'water' | 'door' | 'open';
export interface Player extends Point {
  id: string; name: string; slot: number; connected: boolean; ready: boolean;
  hp: number; maxHp: number; mana: number; maxMana: number; potions: number;
  manaPotions: number; gold: number; xp: number; rank: number; weapon: number; armor: number;
  nextAction: number; facing: Point; kills: number;
}
export interface Enemy extends Point {
  id: string; name: string; icon: number; hp: number; maxHp: number;
  damage: number; nextMove: number; boss?: boolean;
}
export interface Loot extends Point { id: string; kind: 'gold' | 'potion' | 'mana' | 'weapon' | 'armor'; amount: number }
export interface Decoration extends Point { image: string; width: number; height: number }
export interface Portal extends Point { to: number; label: string }
export interface MagicArrow { id: string; level: number; from: Point; to: Point; created: number; duration: number }
export interface Level {
  id: number; name: string; width: number; height: number; tiles: Tile[];
  mobileTiles?: number[]; visible?: number[];
  places?: { name: string; sign: string; role: string; x: number; y: number; width: number; height: number; doorX: number; doorY: number }[];
  shops?: Point[]; restPoints?: Point[];
  rawTiles?: number[]; source?: string; decorations: Decoration[];
  enemies: Enemy[]; loot: Loot[]; portals: Portal[]; spawn: Point;
  explored: number[]; safe: boolean; shop?: Point;
}
export interface GameState {
  arrows?: MagicArrow[];
  mode?: 'solo' | 'coop';
  mapVersion?: number;
  version: 1; code: string; seed: number; level: number; levels: Level[];
  players: Player[]; status: 'waiting' | 'playing' | 'paused' | 'defeated' | 'won';
  tick: number; time: number; log: { id: number; text: string }[]; nextLog: number;
}
export type Action =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'bolt'; x: number; y: number }
  | { type: 'attack' | 'heal' | 'fireball' | 'potion' | 'mana' | 'interact' | 'revive' | 'ready' | 'restart' }
  | { type: 'buy'; item: 'potion' | 'mana' | 'weapon' | 'armor' }
  | { type: 'sell'; item: 'potion' | 'mana' };
export interface Snapshot extends Omit<GameState, 'levels'> { map: Level }
export type ServerMessage =
  | { type: 'welcome'; token: string; playerId: string; code: string }
  | { type: 'state'; state: Snapshot }
  | { type: 'error'; message: string; fatal?: boolean };
