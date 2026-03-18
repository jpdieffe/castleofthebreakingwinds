import type { GameState, Action, Entity, TileCoord, WorldTile, Item, Stats, Equipment } from "../../types";
import { RNG } from "./RNG";
import { ITEMS } from "../data/items";

export const MOVEMENT_POINTS = 4;
export const ACTION_POINTS = 2;
export const AGGRO_RANGE = 5;       // tiles at which hostile NPCs enter combat
export const INTERACT_RANGE = 2;    // tiles for talk / examine / pick up
export const MAP_SIZE = 20;

// ─── Turn order ──────────────────────────────────────────────────────────────

/** Build turn order for a round. Sorts by agility (desc), ties broken by seeded RNG. */
export function buildTurnOrder(state: GameState, rng: RNG): string[] {
  const participants = getActiveParticipants(state);
  // Shuffle first for tie-breaking, then stable-sort by agility desc
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.sort((a, b) => {
    const ea = state.entities[a];
    const eb = state.entities[b];
    return (eb?.stats.agility ?? 0) - (ea?.stats.agility ?? 0);
  });
  return shuffled;
}

/** Entities that participate in this round's turn order. */
export function getActiveParticipants(state: GameState): string[] {
  const ids: string[] = [];
  for (const entity of Object.values(state.entities)) {
    if (entity.hp <= 0) continue;
    if (entity.type === "player") { ids.push(entity.id); continue; }
    if (entity.inCombat) { ids.push(entity.id); continue; }
  }
  return ids;
}

// ─── Combat detection ────────────────────────────────────────────────────────

/** Manhattan distance between two tile coords. */
export function tileDist(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Check if any hostile entity should enter combat (is within aggro range of a player). */
export function checkAggroCombat(state: GameState): GameState {
  let changed = false;
  const players = Object.values(state.entities).filter(e => e.type === "player" && e.hp > 0);
  const entities = { ...state.entities };

  for (const [id, entity] of Object.entries(entities)) {
    if (entity.disposition !== "hostile" || entity.inCombat || entity.hp <= 0) continue;
    for (const player of players) {
      if (tileDist(entity.pos, player.pos) <= entity.aggroRange) {
        entities[id] = { ...entity, inCombat: true };
        changed = true;
        break;
      }
    }
  }

  if (!changed) return state;
  return { ...state, entities, combatActive: true };
}

/** Check if combat should end (no hostile inCombat entities alive). */
export function checkCombatEnd(state: GameState): GameState {
  const anyHostileCombat = Object.values(state.entities).some(
    e => e.disposition === "hostile" && e.inCombat && e.hp > 0
  );
  if (anyHostileCombat) return state;

  // Disengage all
  const entities: Record<string, Entity> = {};
  for (const [id, e] of Object.entries(state.entities)) {
    entities[id] = e.inCombat ? { ...e, inCombat: false } : e;
  }
  return { ...state, entities, combatActive: false };
}

// ─── Action application ─────────────────────────────────────────────────────

export function applyActions(state: GameState, actions: Action[]): GameState {
  let s = deepClone(state);
  for (const action of actions) {
    switch (action.type) {
      case "MOVE":
        s = applyMove(s, action.unitId, action.to);
        break;
      case "ATTACK":
        s = applyAttack(s, action.unitId, action.targetId, action.weaponItemId);
        break;
      case "TALK":
        // Talking is a no-op on state; the scene shows the dialog
        break;
      case "PICK_UP":
        s = applyPickUp(s, action.unitId, action.tile);
        break;
      case "END_TURN":
        break;
    }
  }
  s = checkAggroCombat(s);
  return s;
}

// ─── NPC AI ──────────────────────────────────────────────────────────────────

export interface NpcTurnResult {
  state: GameState;
  actions: Action[];
}

/** Run a single NPC/enemy turn deterministically. */
export function runNpcTurn(state: GameState, entityId: string, npcSeed: number): NpcTurnResult {
  const rng = new RNG(npcSeed);
  let s = deepClone(state);
  const entity = s.entities[entityId];
  const actions: Action[] = [];

  if (!entity || entity.hp <= 0) return { state: s, actions };

  if (entity.disposition === "hostile" && entity.inCombat) {
    // Find nearest player to chase / attack
    const players = Object.values(s.entities).filter(e => e.type === "player" && e.hp > 0);
    if (players.length > 0) {
      players.sort((a, b) => tileDist(a.pos, entity.pos) - tileDist(b.pos, entity.pos));
      const target = players[0];
      const dist = tileDist(entity.pos, target.pos);

      // Try to attack if adjacent
      if (dist <= 1 && entity.actionPoints > 0) {
        s = applyAttack(s, entityId, target.id);
        actions.push({ type: "ATTACK", unitId: entityId, targetId: target.id });
      } else {
        // Move toward target (up to movementPoints steps)
        let mp = entity.movementPoints;
        let current = { ...entity.pos };
        while (mp > 0) {
          const next = stepToward(current, target.pos, s);
          if (!next) break;
          s = applyMove(s, entityId, next);
          actions.push({ type: "MOVE", unitId: entityId, to: next });
          current = next;
          mp--;
          // If now adjacent, try attacking
          if (tileDist(next, target.pos) <= 1 && s.entities[entityId]?.actionPoints > 0) {
            s = applyAttack(s, entityId, target.id);
            actions.push({ type: "ATTACK", unitId: entityId, targetId: target.id });
            break;
          }
        }
      }
    }
  } else {
    // Non-combat: random wander
    const dirs: TileCoord[] = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    const dir = dirs[rng.int(0, 3)];
    const newPos: TileCoord = { x: entity.pos.x + dir.x, y: entity.pos.y + dir.y };
    if (isTileWalkable(s, newPos)) {
      s = applyMove(s, entityId, newPos);
      actions.push({ type: "MOVE", unitId: entityId, to: newPos });
    }
  }

  return { state: s, actions };
}

// ─── World generation ────────────────────────────────────────────────────────

export function generateWorld(seed: number, width: number, height: number): { tiles: WorldTile[][], entities: Record<string, Entity>, items: Record<string, Item> } {
  const rng = new RNG(seed);
  const tiles: WorldTile[][] = [];
  const structures = ["tree", "rock", "bush", "ruins", "well"];

  for (let row = 0; row < height; row++) {
    const tileRow: WorldTile[] = [];
    for (let col = 0; col < width; col++) {
      const r = rng.next();
      let terrain: WorldTile["terrain"] = "grass";
      let structure: string | undefined;

      // 12% chance of a structure
      if (r < 0.12) {
        structure = structures[rng.int(0, structures.length - 1)];
      }
      // 3% chance of stone ground
      if (r > 0.85 && r < 0.88) terrain = "stone";
      // 2% chance of water (unpassable)
      if (r > 0.95) terrain = "water";

      tileRow.push({ terrain, structure });
    }
    tiles.push(tileRow);
  }

  // Clear spawn areas — no structures or water near player spawns
  const clearZones = [{ x: 2, y: 2 }, { x: 17, y: 17 }];
  for (const zone of clearZones) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const r = zone.y + dy, c = zone.x + dx;
        if (r >= 0 && r < height && c >= 0 && c < width) {
          tiles[r][c] = { terrain: "grass" };
        }
      }
    }
  }

  // Copy all items from master registry
  const items: Record<string, Item> = { ...ITEMS };

  // Entities
  const entities: Record<string, Entity> = {
    player_a: makePlayer("player_a", "Hero A", { x: 2, y: 2 }, "player_a",
      { strength: 5, wisdom: 3, agility: 4 }, "sword_iron"),
    player_b: makePlayer("player_b", "Hero B", { x: 17, y: 17 }, "player_b",
      { strength: 3, wisdom: 5, agility: 5 }, "staff_oak"),
  };

  // Spawn some hostile enemies
  const enemySpawns = [
    { id: "enemy_1", name: "Goblin", pos: { x: 10, y: 10 }, stats: { strength: 3, wisdom: 1, agility: 6 }, weapon: "club_wood", hp: 12 },
    { id: "enemy_2", name: "Skeleton", pos: { x: 8, y: 12 }, stats: { strength: 4, wisdom: 1, agility: 3 }, weapon: "dagger_iron", hp: 10 },
    { id: "enemy_3", name: "Dark Mage", pos: { x: 15, y: 5 }, stats: { strength: 2, wisdom: 6, agility: 4 }, weapon: "wand_spark", hp: 8 },
  ];

  for (const e of enemySpawns) {
    // Make sure spawn tile is walkable
    if (tiles[e.pos.y] && tiles[e.pos.x]) {
      tiles[e.pos.y][e.pos.x] = { terrain: "grass" };
    }
    entities[e.id] = makeEnemy(e.id, e.name, e.pos, e.stats, e.weapon, e.hp);
  }

  // Spawn some friendly NPCs
  const friendlySpawns = [
    { id: "npc_merchant", name: "Merchant", pos: { x: 5, y: 5 }, text: "Welcome, traveler! I have wares if you have coin." },
    { id: "npc_hermit", name: "Old Hermit", pos: { x: 14, y: 14 }, text: "Beware the castle... the winds there break more than bones." },
  ];

  for (const n of friendlySpawns) {
    if (tiles[n.pos.y] && tiles[n.pos.x]) {
      tiles[n.pos.y][n.pos.x] = { terrain: "grass" };
    }
    entities[n.id] = makeFriendlyNpc(n.id, n.name, n.pos, n.text);
  }

  // Drop a couple scrolls on the ground
  const groundItems = [
    { itemId: "scroll_fireball", pos: { x: 6, y: 8 } },
    { itemId: "scroll_lightning", pos: { x: 12, y: 15 } },
  ];
  for (const gi of groundItems) {
    if (tiles[gi.pos.y] && tiles[gi.pos.y][gi.pos.x]) {
      tiles[gi.pos.y][gi.pos.x] = { ...tiles[gi.pos.y][gi.pos.x], groundItem: gi.itemId };
    }
  }

  return { tiles, entities, items };
}

// ─── Entity factories ────────────────────────────────────────────────────────

function makePlayer(id: string, name: string, pos: TileCoord, textureKey: string, stats: Stats, weaponId: string): Entity {
  return {
    id, name, type: "player", disposition: "friendly", pos,
    hp: 20, maxHp: 20, movementPoints: MOVEMENT_POINTS, actionPoints: ACTION_POINTS,
    stats, aggroRange: 0, inCombat: false, textureKey,
    inventory: { equipment: defaultEquip(weaponId), bag: [] },
  };
}

function makeEnemy(id: string, name: string, pos: TileCoord, stats: Stats, weaponId: string, hp: number): Entity {
  return {
    id, name, type: "enemy", disposition: "hostile", pos,
    hp, maxHp: hp, movementPoints: 2, actionPoints: 1,
    stats, aggroRange: AGGRO_RANGE, inCombat: false, textureKey: "enemy",
    inventory: { equipment: defaultEquip(weaponId), bag: [] },
  };
}

function makeFriendlyNpc(id: string, name: string, pos: TileCoord, talkText: string): Entity {
  return {
    id, name, type: "npc", disposition: "friendly", pos,
    hp: 15, maxHp: 15, movementPoints: 0, actionPoints: 0,
    stats: { strength: 1, wisdom: 1, agility: 1 }, aggroRange: 0, inCombat: false,
    textureKey: "npc_friendly",
    talkText,
    inventory: { equipment: emptyEquip(), bag: [] },
  };
}

function defaultEquip(weaponId: string): Equipment {
  return { helmet: null, leftHand: null, rightHand: weaponId, chest: null, boots: null, ring1: null, ring2: null };
}

function emptyEquip(): Equipment {
  return { helmet: null, leftHand: null, rightHand: null, chest: null, boots: null, ring1: null, ring2: null };
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function applyMove(state: GameState, unitId: string, to: TileCoord): GameState {
  const unit = state.entities[unitId];
  if (!unit) return state;
  // Only consume MP if unit still has some (NPC AI manages its own budget)
  const newMp = Math.max(0, unit.movementPoints - 1);
  if (!isTileWalkable(state, to)) return state;
  return {
    ...state,
    entities: { ...state.entities, [unitId]: { ...unit, pos: to, movementPoints: newMp } },
  };
}

function applyAttack(state: GameState, attackerId: string, targetId: string, weaponItemId?: string): GameState {
  const attacker = state.entities[attackerId];
  const target = state.entities[targetId];
  if (!attacker || !target) return state;

  // Determine weapon
  const wId = weaponItemId ?? attacker.inventory.equipment.rightHand;
  const weapon = wId ? state.items[wId] : null;
  const baseDmg = weapon?.damage ?? 2; // fists = 2
  const scaling = weapon?.statScaling === "wisdom" ? attacker.stats.wisdom : attacker.stats.strength;
  const damage = Math.max(1, baseDmg + Math.floor(scaling / 2));

  // Defense from armor
  const defense = getDefense(target, state.items);
  const finalDmg = Math.max(1, damage - defense);

  const newHp = Math.max(0, target.hp - finalDmg);
  const updatedTarget: Entity = { ...target, hp: newHp };
  const updatedAttacker: Entity = { ...attacker, actionPoints: Math.max(0, attacker.actionPoints - 1) };

  // If attacking a friendly NPC, turn them hostile and enter combat
  if (target.disposition === "friendly" && target.type === "npc") {
    updatedTarget.disposition = "hostile";
    updatedTarget.type = "enemy";
    updatedTarget.inCombat = true;
    updatedTarget.textureKey = "enemy";
  }

  const entities = { ...state.entities, [attackerId]: updatedAttacker, [targetId]: updatedTarget };

  // Remove dead enemies
  if (updatedTarget.hp === 0 && updatedTarget.type === "enemy") {
    delete entities[targetId];
  }

  // Consume scroll if it was a consumable
  if (weapon?.consumable && wId) {
    // Remove from bag or unequip
    const inv = { ...updatedAttacker.inventory };
    if (inv.equipment.rightHand === wId) {
      inv.equipment = { ...inv.equipment, rightHand: null };
    } else if (inv.equipment.leftHand === wId) {
      inv.equipment = { ...inv.equipment, leftHand: null };
    } else {
      inv.bag = inv.bag.filter(b => b !== wId);
    }
    entities[attackerId] = { ...entities[attackerId], inventory: inv };
  }

  return { ...state, entities, combatActive: true };
}

function applyPickUp(state: GameState, unitId: string, tile: TileCoord): GameState {
  const unit = state.entities[unitId];
  if (!unit) return state;
  const row = tile.y, col = tile.x;
  if (row < 0 || row >= state.mapHeight || col < 0 || col >= state.mapWidth) return state;
  const worldTile = state.worldTiles[row][col];
  if (!worldTile.groundItem) return state;

  const itemId = worldTile.groundItem;
  const newBag = [...unit.inventory.bag, itemId];
  const newTiles = state.worldTiles.map((r, ri) =>
    ri === row ? r.map((t, ci) => ci === col ? { ...t, groundItem: undefined } : t) : r
  );

  return {
    ...state,
    worldTiles: newTiles,
    entities: { ...state.entities, [unitId]: { ...unit, inventory: { ...unit.inventory, bag: newBag } } },
  };
}

function getDefense(entity: Entity, items: Record<string, Item>): number {
  let def = 0;
  const eq = entity.inventory.equipment;
  for (const slotId of Object.values(eq)) {
    if (slotId) {
      const item = items[slotId];
      if (item?.defense) def += item.defense;
    }
  }
  return def;
}

function stepToward(from: TileCoord, to: TileCoord, state: GameState): TileCoord | null {
  const dirs = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ];
  let best: TileCoord | null = null;
  let bestDist = tileDist(from, to);
  for (const d of dirs) {
    const next = { x: from.x + d.x, y: from.y + d.y };
    if (!isTileWalkable(state, next)) continue;
    const dist = tileDist(next, to);
    if (dist < bestDist) { bestDist = dist; best = next; }
  }
  return best;
}

export function isTileWalkable(state: GameState, pos: TileCoord): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= state.mapWidth || pos.y >= state.mapHeight) return false;
  const tile = state.worldTiles[pos.y][pos.x];
  if (tile.terrain === "water" || tile.terrain === "wall") return false;
  if (tile.structure === "tree" || tile.structure === "rock" || tile.structure === "ruins") return false;
  return !Object.values(state.entities).some(e => e.pos.x === pos.x && e.pos.y === pos.y && e.hp > 0);
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
