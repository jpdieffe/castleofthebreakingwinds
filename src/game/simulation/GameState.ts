import type { GameState, Action, Entity, TileCoord } from "../../types";
import { RNG } from "./RNG";

export const MOVEMENT_POINTS = 4;
export const ACTION_POINTS = 2;

/**
 * Apply a list of player actions to a game state, returning the new state.
 * Pure function — no side effects, no Phaser dependencies.
 */
export function applyActions(state: GameState, actions: Action[]): GameState {
  let s = deepClone(state);

  for (const action of actions) {
    switch (action.type) {
      case "MOVE":
        s = applyMove(s, action.unitId, action.to);
        break;
      case "ATTACK":
        s = applyAttack(s, action.unitId, action.targetId);
        break;
      case "END_TURN":
        break;
    }
  }

  return s;
}

export interface NpcPhaseResult {
  state: GameState;
  /** One entry per enemy, in iteration order. actions may be empty if the enemy couldn't move. */
  entityTurns: { entityId: string; actions: Action[] }[];
}

/**
 * Run the NPC/enemy phase deterministically using a seeded RNG.
 * Returns the new state AND per-entity action lists for sequential animation.
 */
export function runNpcPhase(state: GameState, npcSeed: number): NpcPhaseResult {
  const rng = new RNG(npcSeed);
  let s = deepClone(state);
  const entityTurns: { entityId: string; actions: Action[] }[] = [];

  for (const entity of Object.values(s.entities)) {
    if (entity.type !== "enemy") continue;
    const dirs: TileCoord[] = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    const dir = dirs[rng.int(0, 3)];
    const newPos: TileCoord = {
      x: entity.pos.x + dir.x,
      y: entity.pos.y + dir.y,
    };
    const actions: Action[] = [];
    if (isTileWalkable(s, newPos)) {
      s.entities[entity.id] = { ...entity, pos: newPos };
      actions.push({ type: "MOVE", unitId: entity.id, to: newPos });
    }
    entityTurns.push({ entityId: entity.id, actions });
  }

  return { state: s, entityTurns };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function applyMove(state: GameState, unitId: string, to: TileCoord): GameState {
  const unit = state.entities[unitId];
  if (!unit || unit.movementPoints <= 0) return state;
  if (!isTileWalkable(state, to)) return state;

  return {
    ...state,
    entities: {
      ...state.entities,
      [unitId]: { ...unit, pos: to, movementPoints: unit.movementPoints - 1 },
    },
  };
}

function applyAttack(
  state: GameState,
  attackerId: string,
  targetId: string
): GameState {
  const attacker = state.entities[attackerId];
  const target = state.entities[targetId];
  if (!attacker || !target || attacker.actionPoints <= 0) return state;

  // Placeholder: flat 5 damage; weapons/stats will be added later
  const damage = 5;
  const newHp = Math.max(0, target.hp - damage);
  const updatedTarget: Entity = { ...target, hp: newHp };
  const updatedAttacker: Entity = {
    ...attacker,
    actionPoints: attacker.actionPoints - 1,
  };

  const entities = {
    ...state.entities,
    [attackerId]: updatedAttacker,
    [targetId]: updatedTarget,
  };

  // Remove dead enemies
  if (updatedTarget.type === "enemy" && updatedTarget.hp === 0) {
    delete entities[targetId];
  }

  return { ...state, entities };
}

function isTileWalkable(state: GameState, pos: TileCoord): boolean {
  // Simple bounds check placeholder — map/collision will be added with tilemap
  if (pos.x < 0 || pos.y < 0 || pos.x > 19 || pos.y > 19) return false;
  // Check no other entity occupies that tile
  return !Object.values(state.entities).some(
    (e) => e.pos.x === pos.x && e.pos.y === pos.y
  );
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
